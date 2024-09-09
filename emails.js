const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.123-reg.co.uk', 
  port: 465, 
  secure: true, 
  auth: {
    user: 'info@myme.live', 
    pass: process.env.EMAIL_PASSWORD, 
  }
});

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

        <p style="font-size: 16px; color: white; line-height: 1.6;">Please contact us if you believe this block is unjustified or if you have any questions.</p>

        <div style="text-align: center; margin-top: 30px;">
          <a href="${process.env.FRONTEND_URL}/contact" 
             style="background-color: #4CAF50; color: white; padding: 15px 30px; text-align: center; text-decoration: none; display: inline-block; border-radius: 5px; font-weight: bold; font-size: 18px;">
            Contact
          </a>
        </div>
        
        <p style="font-size: 16px; color: white; margin-top: 30px;">Best regards,</p>
        <p style="font-size: 16px; color: white; font-weight: bold;">MyMe Team</p>
        
         <div style="text-align: center; margin-top: 50px;">
          <a href="${process.env.FRONTEND_URL}" style="text-decoration: none;">
            <div style="display: flex; justify-content: center; align-items: stretch; max-width: 200px; margin: 0 auto; gap: 10px;">
              <!-- M takes the left half -->
              <div style="width: 50%; text-align: center; display: flex; justify-content: center; align-items: center;">
                <p style="font-size: 50px; font-weight: 900; color: white; margin: 0;">MyMe.Live</p>
              </div>
            </div>
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


async function sendThankYouEmail(user, purchaseDetails) {
  const mailOptions = {
    from: 'info@myme.live',
    to: user.email,
    subject: 'Thank You for Your Purchase!',
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #000110; color: black; padding: 30px; border-radius: 10px; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">
        <h1 style="text-align: center; color: yellow; font-size: 24px; margin-bottom: 20px;">Thank You for Your Purchase!</h1>
        <p style="font-size: 16px; color: black; line-height: 1.6;">Dear <span style="font-weight: bold;">${user.userName}</span>,</p>
        <p style="font-size: 16px; color: black; line-height: 1.6;">Thank you for purchasing tokens on <span style="color: yellow; font-weight: bold;">MyMe.Live</span>. Your support means a lot to us!</p>
        <p style="font-size: 16px; color: black; line-height: 1.6;">You have purchased <span style="font-weight: bold; color: yellow;">${purchaseDetails.tokens}</span> tokens for a total of <span style="font-weight: bold;">${purchaseDetails.amountSpent} ${purchaseDetails.currency}</span>.</p>

        <p style="font-size: 16px; color: black; line-height: 1.6;">Your tokens have been added to your account, and you can now use them to support your favorite creators.</p>

        <div style="text-align: center; margin-top: 30px;">
          <a href="${process.env.FRONTEND_URL}/" 
             style="background-color: #4CAF50; color: white; padding: 15px 30px; text-align: center; text-decoration: none; display: inline-block; border-radius: 5px; font-weight: bold; font-size: 18px;">
            Go To MyMe
          </a>
        </div>
        
        <p style="font-size: 16px; color: black; margin-top: 30px;">Best regards,</p>
        <p style="font-size: 16px; color: black; font-weight: bold;">MyMe Team</p>
        
        <div style="text-align: center; margin-top: 50px;">
          <a href="${process.env.FRONTEND_URL}" style="text-decoration: none;">
            <div style="display: flex; justify-content: center; align-items: stretch; max-width: 200px; margin: 0 auto; gap: 10px;">
              <!-- M takes the left half -->
              <div style="width: 50%; text-align: center; display: flex; justify-content: center; align-items: center;">
                <p style="font-size: 50px; font-weight: 900; color: white; margin: 0;">MyMe.Live</p>
              </div>
            </div>
          </a>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Thank you email sent to', user.email);
  } catch (err) {
    console.error('Error sending thank you email:', err);
  }
}

async function sendResetPasswordEmail(user, resetToken) {
  const resetLink = `${process.env.FRONTEND_URL}/resetPassword?token=${resetToken}`;
  const mailOptions = {
    from: 'info@myme.live',
    to: user.email,
    subject: 'MyMe.Live Password Reset',
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #000110; color: white; padding: 30px; border-radius: 10px; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">
        <h1 style="text-align: center; color: red; font-size: 24px; margin-bottom: 20px;">Password Reset Request</h1>
        <p style="font-size: 16px; color: white; line-height: 1.6;">Dear <span style="color: yellow; font-weight: bold;">${user.userName}</span>,</p>
        <p style="font-size: 16px; color: white; line-height: 1.6;">We received a request to reset your password. If you made this request, click the link below to reset your password:</p>

        <div style="text-align: center; margin-top: 30px;">
          <a href="${resetLink}" 
             style="background-color: red; color: white; padding: 15px 30px; text-align: center; text-decoration: none; display: inline-block; border-radius: 5px; font-weight: bold; font-size: 18px;">
            Reset My Password
          </a>
        </div>
        
        <p style="font-size: 16px; color: white; line-height: 1.6; margin-top: 20px;">If you didn't request this, please ignore this email.</p>
        <p style="font-size: 16px; color: white; margin-top: 30px;">Best regards,</p>
        <p style="font-size: 16px; color: white; font-weight: bold;">MyMe Team</p>

         <div style="text-align: center; margin-top: 50px;">
          <a href="${process.env.FRONTEND_URL}" style="text-decoration: none;">
            <div style="display: flex; justify-content: center; align-items: stretch; max-width: 200px; margin: 0 auto; gap: 10px;">
              <!-- M takes the left half -->
              <div style="width: 50%; text-align: center; display: flex; justify-content: center; align-items: center;">
                <p style="font-size: 50px; font-weight: 900; color: white; margin: 0;">MyMe.Live</p>
              </div>
            </div>
          </a>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent to', user.email);
  } catch (err) {
    console.error('Error sending reset password email:', err);
  }
}

module.exports = {  sendBlockNotificationEmail, sendThankYouEmail, sendResetPasswordEmail };




