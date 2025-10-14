# Use official lightweight Node.js image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the app
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# Start the app
CMD ["node", "server.js"]
