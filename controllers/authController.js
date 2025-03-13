const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Ensure JWT secret is loaded
if (!process.env.JWT_SECRET) {
  console.error('Error: JWT_SECRET is not defined in the environment variables.');
  process.exit(1); // Exit the server if the secret is missing
}

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Register new user
const registerUser = async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    console.log('Received registration data:', { name, email, password, role });

    const userExists = await User.findOne({ email });
    if (userExists) {
      console.log('User already exists:', email);
      return res.status(400).json({ message: 'User already exists' });
    }

    // Validate role (only accept roles we defined)
    const validRoles = ['admin', 'accountant', 'client'];
    const assignedRole = validRoles.includes(role) ? role : 'admin';
    console.log('Assigned role:', assignedRole);

    // Create user — hashing is handled in pre-save middleware
    const user = await User.create({
      name,
      email,
      password,
      role: assignedRole,
    });

    console.log('User created:', user);

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};




// Login user
const authUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    console.log('Login attempt for email:', email);
    console.log('Password received for comparison:', password);

    const user = await User.findOne({ email });

    if (!user) {
      console.log('User not found for email:', email);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    console.log('User found in database:', user);

    // Compare provided password with stored hashed password
    const passwordMatch = await bcrypt.compare(password, user.password);
    console.log('Password comparison result:', passwordMatch);

    if (passwordMatch) {
      const token = generateToken(user._id);
      console.log('Login successful for:', user.email);
      res.status(200).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token:generateToken(user._id),
      });
    } else {
      console.log('Login failed — password did not match for email:', email);
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { registerUser, authUser };
