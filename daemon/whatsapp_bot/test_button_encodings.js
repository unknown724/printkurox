const { proto, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

// 1. Direct interactiveMessage
const msg1 = generateWAMessageFromContent('123@s.whatsapp.net', {
  interactiveMessage: proto.Message.InteractiveMessage.fromObject({
    header: proto.Message.InteractiveMessage.Header.fromObject({ title: 'Step 1' }),
    body: proto.Message.InteractiveMessage.Body.fromObject({ text: 'Body test' }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
      buttons: [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ id: 'btn_bw', display_text: 'Black & White' }) }
      ]
    })
  })
}, {});

console.log('msg1 keys:', Object.keys(msg1.message));

// 2. templateMessage with buttons
const msg2 = generateWAMessageFromContent('123@s.whatsapp.net', {
  templateMessage: {
    hydratedTemplate: {
      hydratedContentText: 'Choose print mode:',
      hydratedButtons: [
        {
          index: 1,
          quickReplyButton: {
            displayText: '1️⃣ Black & White (₹4/p)',
            id: 'btn_bw'
          }
        },
        {
          index: 2,
          quickReplyButton: {
            displayText: '2️⃣ Color (₹7/p)',
            id: 'btn_color'
          }
        }
      ]
    }
  }
}, {});

console.log('msg2 keys:', Object.keys(msg2.message));
