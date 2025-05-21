const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
// Don't call dotenv.config() here as it should be initialized only once at the application root

const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
        
        // Validate token presence
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // No debug output - silently verify token
        const JWT_SECRET = (process.env.JWT_SECRET || 'your-secret-key').trim();
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Set user info on request object
        req.user = {
            userId: decoded.userId || decoded.id,
            id: decoded.userId || decoded.id, // Ensure both properties exist for backward compatibility
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