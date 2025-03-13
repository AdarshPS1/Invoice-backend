const express = require('express');
const router = express.Router();
const { registerUser, authUser } = require('../controllers/authController');

// Route: POST /api/auth/register (for user registration)
router.post('/register', registerUser);

// Route: POST /api/auth/login (for user login)
router.post('/login', authUser);

module.exports = router;
