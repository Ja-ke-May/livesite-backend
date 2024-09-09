const express = require('express');
const User = require('../models/user');
const UserAds = require('../models/userAds');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');
const crypto = require('crypto');
const { sendResetPasswordEmail } = require('../emails')


const router = express.Router();
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  const validImageTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (validImageTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and GIF files are allowed.'), false);
  }
};

const upload = multer({ storage, fileFilter });

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

async function sendActivationEmail(user, activationToken) {
  const activationLink = `${process.env.FRONTEND_URL}/activate?token=${activationToken}`;
  const mailOptions = {
    from: 'info@myme.live',
    to: user.email,
    subject: 'MyMe.Live Account Activation',
    html: `
  <div style="font-family: Arial, sans-serif; background-color: #000110; color: white; padding: 30px; border-radius: 10px; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">
  <h1 style="text-align: center; color: yellow; font-size: 24px; margin-bottom: 20px;">Activate Your Account</h1>
  <p style="font-size: 16px; color: white; line-height: 1.6;">Thank you for signing up to <span style="color: yellow; font-weight: bold;">MyMe.Live</span>. We are excited to have you on board!</p>
  <p style="font-size: 16px; color: white; line-height: 1.6;">Please click the button below to activate your account:</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="${activationLink}" 
       style="background-color: #4CAF50; color: white; padding: 15px 30px; text-align: center; text-decoration: none; display: inline-block; border-radius: 5px; font-weight: bold; font-size: 18px;">
      Activate Account
    </a>
  </div>
  
  <p style="font-size: 16px; color: white; line-height: 1.6;">This link will expire in 24 hours. If you did not sign up for this account, please disregard this email.</p>
  
  <p style="font-size: 16px; color: white; margin-top: 30px;">Best regards,</p>
  <p style="font-size: 16px; color: white; font-weight: bold;">Jacob May</p>
  
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
  } catch (err) {
    console.error('Error sending activation email:', err);
  }
}


router.post('/profile-picture', upload.single('profilePicture'), authMiddleware, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const userId = req.user.userId;
    const profilePictureBase64 = req.file.buffer.toString('base64');

    const user = await User.findByIdAndUpdate(userId, { profilePicture: profilePictureBase64 }, { new: true });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.recentActivity.push(`${user.userName} updated their profile picture`);
    await user.save();

    res.json({ profilePicture: profilePictureBase64 });
  } catch (err) {
    console.error('Error uploading profile picture:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

router.post('/signup', async (req, res) => {
  try {
    const { userName, email, password, dob, marketingConsent } = req.body;

    if (!userName || !email || !password || !dob) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const normalizedEmail = email.toLowerCase();

    const existingUser = await User.findOne({ userName });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const existingEmail = await User.findOne({ normalizedEmail });
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const activationToken = crypto.randomBytes(20).toString('hex');
    const activationExpires = Date.now() + 24 * 60 * 60 * 1000; 

    const user = new User({
      userName,
      email: normalizedEmail,
      password: hashedPassword,
      dob,
      marketingConsent: marketingConsent || false,
      activationToken,
      activationExpires,
      isActivated: false
    });

    await user.save();

    await sendActivationEmail(user, activationToken);

    res.status(201).json({ message: 'User created successfully. Please check your email to activate your account.' });
  } catch (err) {
    console.error('Error during signup:', err);
    res.status(500).json({ error: err.message });
  }
});


router.get('/activate', async (req, res) => {
  const { token } = req.query;

  try {
    const currentTime = Date.now();
    

    const user = await User.findOne({
      activationToken: token,
      activationExpires: { $gt: currentTime },  
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired activation link' });
    }


    user.isActivated = true;
    user.activationToken = undefined;  
    user.activationExpires = undefined;  
    await user.save();

    res.status(200).json({ message: 'Account activated successfully' });
  } catch (err) {
    console.error('Error activating account:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});



router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } });

   
    

    if (!user) {
      return res.status(401).json({ message: 'No account with this email' });
    }

    if (!user.isActivated) {
      return res.status(401).json({ message: 'Account not activated. Please check your email to activate your account.' });
    }

     if (user.isBlocked) {
      const now = new Date();

      if (user.blockExpiryDate && now < user.blockExpiryDate) {
        return res.status(403).json({ message: `You are blocked until ${user.blockExpiryDate}` });
      }

      if (!user.blockExpiryDate) {
        return res.status(403).json({ message: 'You are permanently blocked from this service' });
      }

      if (user.blockExpiryDate && now >= user.blockExpiryDate) {
        user.isBlocked = false;
        user.blockExpiryDate = null;
        await user.save();
      }
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Password incorrect' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET,);



    res.json({ message: 'Login successful', token, username: user.userName, isAdmin: user.isAdmin }); // Return the username
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({ error: err.message });
  }
});


router.get('/check-username/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const existingUser = await User.findOne({
      userName: { $regex: new RegExp(`^${username}$`, 'i') }
    });

    if (existingUser) {
      return res.status(200).json({ available: false });
    }
    return res.status(200).json({ available: true });
  } catch (err) {
    console.error('Error checking username:', err);
    res.status(500).json({ error: err.message });
  }
});


router.get('/profile/:username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ userName: username }).select('-password -otherUnnecessaryFields'); 
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ message: 'Server error, please try again later' });
  }
});


router.put('/profile/username', authMiddleware, async (req, res) => {
  try {
    const { userName } = req.body;

    if (!userName) {
      return res.status(400).json({ message: 'Username is required' });
    }

    const existingUser = await User.findOne({
      userName: { $regex: new RegExp(`^${userName}$`, 'i') }
    });
    
    if (existingUser && existingUser._id.toString() !== req.user.userId.toString()) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const now = new Date();
    if (user.lastUsernameChange) {
      const oneDay = 24 * 60 * 60 * 1000; 
      const lastChange = new Date(user.lastUsernameChange);
      if (now - lastChange < oneDay) {
        return res.status(403).json({ message: 'You can only change your username once per day' });
      }
    }

    user.userName = userName;
    user.lastUsernameChange = now;
    await user.save();

    res.json({ message: 'Username updated successfully', userName: user.userName });
  } catch (err) {
    console.error('Error updating username:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/profile/bio', authMiddleware, async (req, res) => {
  try {
    const { bio } = req.body;

    if (!bio) {
      return res.status(400).json({ message: 'Bio is required' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.bio = bio;
    user.recentActivity.push(`${user.userName} updated their bio`);
    await user.save();

    res.json({ message: 'Bio updated successfully', bio: user.bio });
  } catch (err) {
    console.error('Error updating bio:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/supporters', authMiddleware, async (req, res) => {
  try {
    const { username } = req.query;
    const user = await User.findOne({ userName: username });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isUserSupported = user.supportedUsers.includes(req.user.userId);
    res.json({ supportersCount: user.supporters, isUserSupported });
  } catch (err) {
    console.error('Error fetching supporters:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

router.post('/supporters/toggle', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ userName: username });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userId = req.user.userId;
    const supporter = await User.findById(userId);

    if (!supporter) {
      return res.status(404).json({ message: 'Supporter not found' });
    }

    const isUserSupported = user.supportedUsers.includes(userId);

    if (isUserSupported) {
      user.supportedUsers.pull(userId);
      user.supporters -= 1;
    } else {
      user.supportedUsers.push(userId);
      user.supporters += 1;
      user.recentActivity.push(`${supporter.userName} supported ${user.userName}`);
      supporter.recentActivity.push(`${supporter.userName} supported ${user.userName}`);
    }

    await user.save();
    await supporter.save();

    res.json({ supportersCount: user.supporters, isSupported: !isUserSupported });
  } catch (err) {
    console.error('Error toggling support status:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

router.post('/profile/link', upload.single('image'), authMiddleware, async (req, res) => {
  try {
    const { text, url } = req.body;
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let imageUrl = '';
    if (req.file) {
      imageUrl = req.file.buffer.toString('base64');
    }

    user.links.push({ text, url, imageUrl });
    user.recentActivity.push(`${user.userName} added a new link: ${text}`);
    await user.save();

    res.json(user.links);
  } catch (err) {
    console.error('Error adding link:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

router.delete('/profile/link/:linkId', authMiddleware, async (req, res) => {
  try {
    const { linkId } = req.params;
    const userId = req.user.userId;


    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const linkIndex = user.links.findIndex(link => link._id.toString() === linkId);
    if (linkIndex === -1) {
      return res.status(404).json({ message: 'Link not found' });
    }

    user.links.splice(linkIndex, 1);
    await user.save();

    res.json(user.links);
  } catch (err) {
    console.error('Error deleting link:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

router.get('/recent-activity/:username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ userName: username });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.recentActivity);
  } catch (err) {
    console.error('Error fetching recent activity:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

router.post('/send-tokens', authMiddleware, async (req, res) => {
  try {
    const { recipientUsername, tokenAmount } = req.body;

    if (!recipientUsername || !tokenAmount || tokenAmount <= 0) {
      return res.status(400).json({ message: 'Recipient username and a valid token amount are required' });
    }

    const sender = await User.findById(req.user.userId);
    const recipient = await User.findOne({ userName: recipientUsername });

    if (!sender) {
      return res.status(404).json({ message: 'Sender not found' });
    }
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found' });
    }

    if (sender.userName === recipient.userName) {
      return res.status(400).json({ message: 'You cannot send tokens to yourself' });
    }
    

    if (sender.tokens < tokenAmount) {
      return res.status(400).json({ message: 'Insufficient tokens' });
    }

    sender.tokens -= tokenAmount;
    recipient.tokens += tokenAmount;

    sender.recentActivity.push(`Sent ${tokenAmount} tokens to ${recipient.userName}`);
    recipient.recentActivity.push(`Received ${tokenAmount} tokens from ${sender.userName}`);

    await sender.save();
    await recipient.save();

    res.json({ message: `Successfully transferred ${tokenAmount} tokens to ${recipient.userName}` });
  } catch (err) {
    console.error('Error transferring tokens:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

router.post('/deduct-tokens', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'A valid token amount is required' });
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.tokens < amount) {
      return res.status(400).json({ message: 'Insufficient tokens' });
    }

    user.tokens -= amount;
    

    await user.save();

    res.json({ message: `Successfully deducted ${amount} tokens`, tokens: user.tokens });
  } catch (err) {
    console.error('Error deducting tokens:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

router.post('/award-tokens', authMiddleware, async (req, res) => {
  try {
    const { username, amount } = req.body;

    if (!username || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Username and a valid token amount are required' });
    }

    const user = await User.findOne({ userName: username });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.tokens += amount;
    user.recentActivity.push(`Received ${amount} tokens`);

    await user.save();

    res.json({ message: `Successfully awarded ${amount} tokens to ${username}`, tokens: user.tokens });
  } catch (err) {
    console.error('Error awarding tokens:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

router.post('/profile/live-duration', authMiddleware, async (req, res) => {
  try {
    const { username, liveDuration } = req.body;



    if (!username || !liveDuration || liveDuration < 0) {
      return res.status(400).json({ message: 'Username and a valid live duration are required' });
    }

    const user = await User.findOne({ userName: username });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

   

    user.totalLiveDuration = (user.totalLiveDuration || 0) + liveDuration;

    if (liveDuration > user.longestLiveDuration) {
      user.longestLiveDuration = liveDuration;
    }

    await user.save();

  
    res.json({ 
      message: `Successfully updated live duration for ${username}`, 
      totalLiveDuration: user.totalLiveDuration,
      longestLiveDuration: user.longestLiveDuration
    });
  } catch (err) {
    console.error('Error updating live duration:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

router.put('/comment/color', authMiddleware, async (req, res) => {
  try {
    const { username, colorType, color } = req.body;

    if (!username || !colorType || !color) {
      return res.status(400).json({ message: 'Username, color type, and color are required' });
    }

    const user = await User.findOne({ userName: username });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let activityMessage = '';

    if (colorType === 'commentColor') {
      user.commentColor = color;
      activityMessage = `${user.userName} changed their comment color to ${color}`;
    } else if (colorType === 'borderColor') {
      user.borderColor = color;
      activityMessage = `${user.userName} changed their border color to ${color}`;
    } else if (colorType === 'usernameColor') {
      user.usernameColor = color;
      activityMessage = `${user.userName} changed their username color to ${color}`;
    } else {
      return res.status(400).json({ message: 'Invalid color type' });
    }

    if (activityMessage) {
      user.recentActivity.push(activityMessage);
    }

    await user.save();

    res.json({ message: 'Color updated successfully', user });
  } catch (err) {
    console.error('Error updating color:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

router.post('/update-purchase', async (req, res) => {
  const { username, tokens, amountSpent, currency, description } = req.body;

  try {
      const user = await User.findOne({ userName: username });
      if (!user) {
          return res.status(404).json({ message: 'User not found' });
      }

      user.tokens += tokens;

      const purchaseDetails = {
          date: new Date(),
          tokens,
          amountSpent,
          currency,
          description
      };
      user.purchases.push(purchaseDetails);

      await user.save();

      res.json({ message: 'Purchase updated successfully', user });
  } catch (error) {
      console.error('Error updating purchase:', error);
      res.status(500).json({ message: 'Server error' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetTokenExpires = Date.now() + 3600000;

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpires;
    await user.save();

   
    await sendResetPasswordEmail(user, resetToken);

    res.status(200).json({ message: 'Password reset email sent' });
  } catch (error) {
    console.error('Error in forgot password route:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined; 
    user.resetPasswordExpires = undefined;

    await user.save();
    res.status(200).json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Error in reset password route:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/ads/count', async (req, res) => {
  try {
    const result = await UserAds.aggregate([
      { $project: { linksCount: { $size: "$links" } } }, 
      { $group: { _id: null, totalLinksCount: { $sum: "$linksCount" } } } 
    ]);

    const adsCount = result.length > 0 ? result[0].totalLinksCount : 0; 

    res.json({ count: adsCount });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch ads count' });
  }
});

module.exports = router;
