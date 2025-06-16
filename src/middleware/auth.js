const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
// JWT config should be initialized at application root

const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
        
        // Validating token presence
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // No debug output - silently verify token
        const JWT_SECRET = (process.env.JWT_SECRET || 'your-secret-key').trim();
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Normalize user object
        req.user = {
            userId: decoded.userId || decoded.id,
            id: decoded.userId || decoded.id, // For compatibility
            role: decoded.role || 'user',
            name: decoded.name,
            email: decoded.email
        };
        
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token: ' + error.message });
    }
};

module.exports = authMiddleware; 