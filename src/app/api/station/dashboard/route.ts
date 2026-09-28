import { NextRequest, NextResponse } from 'next/server';
import { queryD1 } from '@/lib/cloudflare-d1';
import { getStationPricing, saveStationPricing } from '@/lib/station-pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { stationId, pin, token, action, pricingUpdates } = body;

    if (!stationId || (!pin && !token)) {
      return NextResponse.json({ success: false, error: 'Missing credentials' }, { status: 400 });
    }

    // 1. Verify Station and Credentials (supports both secret station_token and admin password)
    const stationRows = await queryD1<{ 
      id: string; 
      name: string; 
      admin_pin: string; 
      station_token: string; 
      station_type: string;
      status: string;
      last_heartbeat: string;
    }>(
      'SELECT id, name, admin_pin, station_token, station_type, status, last_heartbeat FROM stations WHERE id = ? LIMIT 1',
      [stationId]
    );

    if (stationRows.length === 0) {
      return NextResponse.json({ success: false, error: 'Station not found' }, { status: 404 });
    }

    const station = stationRows[0];

    // Cryptographic Token Match (Magic Link / Saved Device) OR Password Match
    const isTokenValid = token && station.station_token === token;
    const isPasswordValid = pin && station.admin_pin === pin;

    if (!isTokenValid && !isPasswordValid) {
      return NextResponse.json({ success: false, error: 'Invalid password or access token' }, { status: 401 });
    }

    // Handle Price Update Action from Owner
    if (action === 'UPDATE_PRICING' && pricingUpdates) {
      const saveRes = await saveStationPricing(stationId, pricingUpdates);
      if (!saveRes.success) {
        return NextResponse.json({ success: false, error: saveRes.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        message: 'Station pricing updated successfully',
        pricing: saveRes.config,
      });
    }

    // 2. Fetch Jobs for this station
    const jobs = await queryD1<{ 
      id: string; 
      status: string; 
      total_price: number; 
      total_pages: number;
      created_at: string;
    }>(
      `SELECT id, status, total_price, total_pages, created_at 
       FROM print_jobs 
       WHERE station_id = ? AND status = 'COMPLETED'
       ORDER BY created_at DESC`,
      [stationId]
    );

    let totalEarned = 0;
    let todayEarned = 0;
    let todayPages = 0;
    let totalPages = 0;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const recentJobs = [];

    for (const job of jobs) {
      const jobDate = job.created_at.split(' ')[0];
      totalEarned += job.total_price;
      totalPages += job.total_pages;

      if (jobDate === todayStr || job.created_at.startsWith(todayStr)) {
        todayEarned += job.total_price;
        todayPages += job.total_pages;
      }
      
      if (recentJobs.length < 20) {
        recentJobs.push(job);
      }
    }

    // Fetch current dynamic pricing for this station
    const pricing = await getStationPricing(stationId);

    // Platform takes 10% cut
    const ownerCutTotal = Math.floor(totalEarned * 0.90);
    const ownerCutToday = Math.floor(todayEarned * 0.90);

    return NextResponse.json({
      success: true,
      stationName: station.name,
      stationType: station.station_type,
      stationToken: station.station_token,
      deviceStatus: {
        status: station.status || 'offline',
        lastHeartbeat: station.last_heartbeat || null,
      },
      pricing: {
        bwSingle: pricing.bwSingle,
        colorSingle: pricing.colorSingle,
        bwBulk: pricing.bwBulk,
        colorBulk: pricing.colorBulk,
      },
      metrics: {
        totalEarned: ownerCutTotal,
        todayEarned: ownerCutToday,
        totalPages,
        todayPages
      },
      recentJobs
    });

  } catch (err) {
    console.error('Owner Dashboard API Error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

