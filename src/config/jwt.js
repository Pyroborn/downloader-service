const jwt = require('jsonwebtoken');

//  dotenv is initialized 
require('dotenv').config();

// Getting JWT_SECRET directly from environment variables
let JWT_SECRET = process.env.JWT_SECRET;

// Log secret length for validation
if (JWT_SECRET) {
    console.log(`JWT Config: JWT_SECRET loaded with length ${JWT_SECRET.length}`);
} else {
    console.error('JWT_SECRET environment variable is not set!');
    console.error('Authentication and token validation will fail.');
}

// Remove quotes from secret if present
if (JWT_SECRET && JWT_SECRET.startsWith('"') && JWT_SECRET.endsWith('"')) {
    JWT_SECRET = JWT_SECRET.substring(1, JWT_SECRET.length - 1);
    console.log('JWT Config: Removed quotes from JWT_SECRET');
}

// Trim whitespace
if (JWT_SECRET) {
    JWT_SECRET = JWT_SECRET.trim();
}

// Verification function for consistent token validation
const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        console.error('JWT verification error:', error.message);
        return null;
    }
};

// Sign function for consistent token generation
const signToken = (payload, options = {}) => {
    return jwt.sign(payload, JWT_SECRET, options);
};

// Decode function without verification (for debugging)
const decodeToken = (token) => {
    try {
        return jwt.decode(token);
    } catch (error) {
        console.error('JWT decode error:', error.message);
        return null;
    }
};

module.exports = {
    verifyToken,
    signToken,
    decodeToken,
    JWT_SECRET
};