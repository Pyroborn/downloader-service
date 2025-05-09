# Use Node.js Alpine image for smaller size
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy app source
COPY . .

# Expose port
EXPOSE 3004

# Start the service
CMD ["npm", "start"] 