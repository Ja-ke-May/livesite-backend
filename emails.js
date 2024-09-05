const nodemailer = require('nodemailer');

// Create transport for Nodemailer using 123 Reg settings
const transporter = nodemailer.createTransport({
  host: 'smtp.123-reg.co.uk', // 123 Reg SMTP host
  port: 465, // 465 for SSL or 587 for TLS
  secure: true, // Set to 'true' for SSL on port 465, 'false' for TLS on port 587
  auth: {
    user: 'info@myme.live', 
    pass: process.env.EMAIL_PASSWORD, 
  }
});

// Function to send block notification email
async function sendBlockNotificationEmail(user, blockDuration) {
  const blockMessage = blockDuration === 'permanent'
    ? 'Your account has been permanently blocked.'
    : `Your account has been blocked for ${blockDuration}.`;
  
  const mailOptions = {
    from: 'info@myme.live',
    to: user.email,
    subject: 'MyMe.Live Account Blocked',
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #000110; color: white; padding: 30px; border-radius: 10px; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">
        <h1 style="text-align: center; color: red; font-size: 24px; margin-bottom: 20px;">Account Blocked</h1>
        <p style="font-size: 16px; color: white; line-height: 1.6;">Dear <span style="color: yellow; font-weight: bold;">${user.userName}</span>,</p>
        <p style="font-size: 16px; color: white; line-height: 1.6;">Unfortunately, your account has been blocked due to a violation of our policies.</p>
        <p style="font-size: 16px; color: white; line-height: 1.6;">${blockMessage}</p>

        <p style="font-size: 16px; color: white; line-height: 1.6;">Please contact our support team if you believe this block is unjustified or if you have any questions.</p>

        <div style="text-align: center; margin-top: 30px;">
          <a href="${process.env.FRONTEND_URL}/support" 
             style="background-color: #4CAF50; color: white; padding: 15px 30px; text-align: center; text-decoration: none; display: inline-block; border-radius: 5px; font-weight: bold; font-size: 18px;">
            Contact Support
          </a>
        </div>
        
        <p style="font-size: 16px; color: white; margin-top: 30px;">Best regards,</p>
        <p style="font-size: 16px; color: white; font-weight: bold;">Jacob May</p>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="${process.env.FRONTEND_URL}" style="text-decoration: none; color: white; font-weight: bold;">
            MYME.LIVE
          </a>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Block notification email sent to', user.email);
  } catch (err) {
    console.error('Error sending block notification email:', err);
  }
}

module.exports = { sendBlockNotificationEmail };
