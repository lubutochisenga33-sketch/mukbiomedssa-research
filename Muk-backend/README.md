# MUK-BIOMEDSSA Backend

Backend API server for the MUK-BIOMEDSSA Research Application.

## Features
- User authentication (login/register)
- Article management (CRUD operations)
- File upload for PDFs
- Configuration management
- Understanding materials

## Tech Stack
- Node.js
- Express.js
- File-based JSON storage
- Multer for file uploads

## Local Development
```bash
npm install
npm start
```

Server runs on http://localhost:3000

## API Endpoints
- `GET /health` - Health check
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `GET /articles` - Get all articles
- `POST /articles` - Create article (with file upload)
- `PUT /articles/:id` - Update article
- `DELETE /articles/:id` - Delete article
- `GET /config` - Get app configuration
- `POST /config` - Update app configuration
- `GET /understanding` - Get all understanding materials
- `POST /understanding/:articleId` - Save understanding materials
