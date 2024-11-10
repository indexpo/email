const Imap = require('imap');
const fetch = require('node-fetch');
const { simpleParser } = require('mailparser');
const express = require('express');

// Configuration
const WEBHOOK_URL = "https://discord.com/api/webhooks/1261960039669698603/8OtQx4wIZjivlZtCwREZfha5XusIn73dxPNulTkFa7lHCW-MBF3_OGaHOAQzGYdZToep";
const EMAIL_CONFIG = {
  user: "mstbeliakhatun@gmail.com",
  password: "uwax ofkx qcdv evwg",
  host: "imap.gmail.com",
  port: 993,
  tls: true,
  tlsOptions: { 
    rejectUnauthorized: false,
    servername: "imap.gmail.com"
  },
  keepalive: {
    interval: 1000,
    idleInterval: 1000,
    forceNoop: true
  },
  authTimeout: 5000,
  connTimeout: 5000,
};

// Connection management
let imap = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 999999;
const INITIAL_RECONNECT_DELAY = 100;

function createImapConnection() {
  imap = new Imap(EMAIL_CONFIG);
  setupImapListeners();
  return imap;
}

function setupImapListeners() {
  imap.once('ready', onImapReady);
  imap.on('error', onImapError);
  imap.on('end', onImapEnd);
  imap.on('mail', onNewMail);
}

async function processNewEmail(fullMessage) {
  try {
    const parsed = await simpleParser(fullMessage);
    
    // Extract sender's email address
    const senderEmail = parsed.from?.value[0]?.address || 'Unknown';
    
    // Extract recipient email addresses
    const toEmails = parsed.to?.value.map(recipient => recipient.address).join(', ') || 'Unknown';
    
    // Format the message content
    const messageContent = parsed.text || 'No message content';
    
    const discordPayload = {
      embeds: [{
        color: 0x00ff00, // Green color for better visibility
        title: `📧 New Email Details`,
        fields: [
          {
            name: '📤 From',
            value: `\`${senderEmail}\``,
            inline: false
          },
          {
            name: '📥 To',
            value: `\`${toEmails}\``,
            inline: false
          },
          {
            name: '📝 Subject',
            value: parsed.subject || 'No Subject',
            inline: false
          },
          {
            name: '💬 Message',
            value: messageContent.substring(0, 1024) || 'No message content', // Discord field limit is 1024
            inline: false
          },
          {
            name: '⏰ Received',
            value: parsed.date?.toLocaleString() || new Date().toLocaleString(),
            inline: false
          }
        ],
        footer: {
          text: 'Email Monitor Bot'
        },
        timestamp: new Date().toISOString()
      }]
    };

    // Fire and forget - don't await the webhook
    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload)
    }).catch(error => console.error('Discord webhook error:', error));

    console.log(`✓ Processed email from: ${senderEmail} to: ${toEmails}`);
  } catch (error) {
    console.error('Processing error:', error);
  }
}

function openInbox() {
  return new Promise((resolve, reject) => {
    imap.openBox('INBOX', false, (err, mailbox) => {
      if (err) reject(err);
      else resolve(mailbox);
    });
  });
}

async function onImapReady() {
  try {
    console.log('✓ Connected to inbox');
    reconnectAttempts = 0;
    await openInbox();
  } catch (error) {
    console.error('Error opening inbox:', error);
    reconnect();
  }
}

function onNewMail() {
  try {
    const f = imap.seq.fetch('*', {
      bodies: '',
      struct: true
    });

    f.on('message', (msg) => {
      let buffer = '';
      
      msg.on('body', (stream) => {
        stream.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
        });
        
        stream.once('end', () => {
          setImmediate(() => processNewEmail(buffer));
        });
      });
    });

    f.once('error', (err) => {
      console.error('Fetch error:', err);
      reconnect();
    });
  } catch (error) {
    console.error('Error processing new mail:', error);
    reconnect();
  }
}

function onImapError(err) {
  console.error('IMAP error:', err);
  reconnect();
}

function onImapEnd() {
  console.log('Connection ended');
  reconnect();
}

function reconnect() {
  if (imap) {
    try {
      imap.destroy();
    } catch (error) {
      // Ignore destroy errors
    }
  }
  setImmediate(() => {
    imap = createImapConnection();
    imap.connect();
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  if (imap) {
    imap.end();
  }
  process.exit(0);
});

// Express server setup
const app = express();
app.use(express.json());

app.post('/test-webhook', (req, res) => {
  res.send('OK');
});

// Start the application
console.log('Starting email monitor...');
createImapConnection().connect();

app.listen(3000, () => {
  console.log('Test webhook server running on port 3000');
});