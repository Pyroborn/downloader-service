# Use Node.js Alpine image for smaller size
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy app source
COPY . .

# Create directories for uploads and downloads
RUN mkdir -p uploads downloads

# Expose port
EXPOSE 3004

# Start the service
CMD ["node", "src/index.js"] 