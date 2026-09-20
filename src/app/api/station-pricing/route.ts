import { NextRequest, NextResponse } from 'next/server';
import {
  getStationPricing,
  saveStationPricing,
  getAllStationsPricing,
  buildTierRatesFromConfig,
  validatePricingGuardrails,
  StationPricingConfig,
} from '@/lib/station-pricing';
import { getStationConfig, validateStationPinWithRole } from '@/lib/stations';
import {
  ADMIN_COOKIE_NAME,
  STATION_SESSION_COOKIE,
  verifyAdminDevice,
  verifyStationSession,
  recordAuditLog,
} from '@/lib/admin-auth';
import { checkRateLimit, recordFailedAttempt, resetFailedAttempts } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Helper to check authorization and identify role (master_admin vs coadmin).
 */
async function authorizeRequest(
  req: NextRequest,
  targetStationId: string,
  providedPin?: string
): Promise<{ authorized: boolean; isMaster: boolean; stationId?: string }> {
  // 1. Check Master Admin Device Token
  const masterToken = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (masterToken) {
    const { isValid } = await verifyAdminDevice(masterToken);
    if (isValid) {
      return { authorized: true, isMaster: true, stationId: targetStationId };
    }
  }

  // 2. Check Station Session Cookie
  const sessionCookie = req.cookies.get(STATION_SESSION_COOKIE)?.value;
  if (sessionCookie) {
    const session = verifyStationSession(sessionCookie);
    if (session) {
      if (session.role === 'master_admin') {
        return { authorized: true, isMaster: true, stationId: targetStationId };
      }
      if (session.stationId === targetStationId) {
        return { authorized: true, isMaster: false, stationId: targetStationId };
      }
    }
  }

  // 3. Fallback: Check direct PIN provided in payload
  if (providedPin && providedPin.trim().length > 0) {
    const pinCheck = validateStationPinWithRole(targetStationId, providedPin.trim());
    if (pinCheck.isValid) {
      return { authorized: true, isMaster: pinCheck.isMaster, stationId: targetStationId };
    }
  }

  return { authorized: false, isMaster: false };
}

/**
 * GET: Fetch pricing for a specific station or all stations.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stationId = searchParams.get('station_id') || searchParams.get('station');

    if (stationId) {
      const config = await getStationPricing(stationId);
      const tierRates = buildTierRatesFromConfig(config);
      return NextResponse.json({
        success: true,
        stationId,
        config,
        tierRates,
      });
    }

    // Return all stations pricing
    const allStations = await getAllStationsPricing();
    return NextResponse.json({
      success: true,
      stations: allStations,
    });
  } catch (err: unknown) {
    console.error('Failed to get station pricing:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * POST: Update station pricing with guardrail enforcement and role-based permissions.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      station_id: rawStationId,
      stationId: altStationId,
      bwSingle,
      colorSingle,
      bwBulk,
      colorBulk,
      bwMega,
      colorMega,
      bwDuplex,
      colorDuplex,
      assignmentDiscountPct,
      megaDiscountPct,
      razorpayAccountId,
      commissionPercent,
      pin,
    } = body;

    const stationId = (rawStationId || altStationId || 'block_b').toLowerCase().trim();
    const station = getStationConfig(stationId);

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // 1. Check IP rate limit lockout
    const rateCheck = await checkRateLimit(ip);
    if (!rateCheck.allowed) {
      await recordAuditLog({
        actor_role: 'system',
        action_type: 'IP_LOCKED_OUT',
        details: `Station pricing edit blocked: ${rateCheck.message}`,
        ip_address: ip,
        user_agent: userAgent,
      });
      return NextResponse.json({ error: rateCheck.message }, { status: 429 });
    }

    // 2. Verify authentication
    const auth = await authorizeRequest(req, station.id, pin);
    if (!auth.authorized) {
      if (pin) {
        await recordFailedAttempt(ip);
      }
      await recordAuditLog({
        station_id: station.id,
        actor_role: 'system',
        action_type: 'UNAUTHORIZED_PRICING_ATTEMPT',
        target_id: station.id,
        details: `Unauthorized attempt to edit pricing for ${station.name}`,
        ip_address: ip,
        user_agent: userAgent,
      });
      return NextResponse.json(
        { error: 'Unauthorized. Please log in as Admin or Station Operator.' },
        { status: 401 }
      );
    }

    if (pin) {
      await resetFailedAttempts(ip);
    }

    const updates: Partial<StationPricingConfig> = {};

    if (bwSingle !== undefined) updates.bwSingle = Number(bwSingle);
    if (colorSingle !== undefined) updates.colorSingle = Number(colorSingle);
    if (bwBulk !== undefined) updates.bwBulk = Number(bwBulk);
    if (colorBulk !== undefined) updates.colorBulk = Number(colorBulk);
    if (bwMega !== undefined) updates.bwMega = Number(bwMega);
    if (colorMega !== undefined) updates.colorMega = Number(colorMega);
    if (bwDuplex !== undefined) updates.bwDuplex = Number(bwDuplex);
    if (colorDuplex !== undefined) updates.colorDuplex = Number(colorDuplex);
    if (assignmentDiscountPct !== undefined) updates.assignmentDiscountPct = Number(assignmentDiscountPct);
    if (megaDiscountPct !== undefined) updates.megaDiscountPct = Number(megaDiscountPct);

    // Only Master Admin can modify platform commission % or Razorpay sub-merchant account IDs
    if (auth.isMaster) {
      if (razorpayAccountId !== undefined) {
        updates.razorpayAccountId = typeof razorpayAccountId === 'string' ? razorpayAccountId.trim() : '';
      }
      if (commissionPercent !== undefined) {
        updates.commissionPercent = Number(commissionPercent);
      }
    } else {
      if (commissionPercent !== undefined || razorpayAccountId !== undefined) {
        // Co-admin cannot adjust commission or payout routing
        console.warn(`Station co-admin attempted to change commission or razorpayAccountId for ${station.id}`);
      }
    }

    // Validate guardrails
    const guardrailCheck = validatePricingGuardrails(updates);
    if (!guardrailCheck.isValid) {
      return NextResponse.json(
        { error: guardrailCheck.error || 'Pricing violates platform safety guardrails.' },
        { status: 400 }
      );
    }

    const result = await saveStationPricing(station.id, updates);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to save pricing in database.' },
        { status: 500 }
      );
    }

    // Audit log
    await recordAuditLog({
      station_id: station.id,
      actor_role: auth.isMaster ? 'master_admin' : 'coadmin',
      action_type: 'UPDATE_STATION_PRICING',
      target_id: station.id,
      details: JSON.stringify(updates),
      ip_address: ip,
      user_agent: userAgent,
    });

    const tierRates = result.config ? buildTierRatesFromConfig(result.config) : undefined;

    return NextResponse.json({
      success: true,
      message: `Pricing updated for ${station.name}`,
      config: result.config,
      tierRates,
    });
  } catch (err: unknown) {
    console.error('Error updating station pricing:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
