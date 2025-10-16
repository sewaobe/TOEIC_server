# TOEIC Server

A robust Node.js backend API for the TOEIC learning and testing platform. Built with Express.js, TypeScript, and MongoDB for scalable and maintainable server-side operations.

## 🚀 Features

- **RESTful API**: Comprehensive REST API endpoints for all platform features
- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **Real-time Communication**: Socket.IO integration for live notifications and updates
- **Database Management**: MongoDB with Mongoose ODM for data persistence
- **File Upload**: Firebase integration for media file management
- **Email Services**: Nodemailer for user notifications and password resets
- **Push Notifications**: Web Push API for browser notifications
- **API Documentation**: Swagger/OpenAPI documentation
- **Logging**: Winston-based logging with daily rotation
- **Security**: Helmet.js for security headers, CORS support

## 🛠️ Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js 5.1.0
- **Database**: MongoDB with Mongoose 8.17.1
- **Authentication**: JSON Web Tokens (JWT)
- **Real-time**: Socket.IO 4.8.1
- **File Storage**: Firebase Admin SDK 13.5.0
- **Email**: Nodemailer 7.0.5
- **Push Notifications**: Web Push 3.6.7
- **Logging**: Winston 3.17.0 with daily rotation
- **Security**: Helmet 8.1.0, CORS 2.8.5
- **Validation**: Zod 4.1.0
- **Documentation**: Swagger JSDoc 6.2.8
- **Development**: Nodemon, ts-node

## 📋 Prerequisites

- Node.js (version 18 or higher)
- MongoDB (local or cloud instance)
- Firebase project with storage bucket
- Gmail account for email services (or SMTP provider)

## 🚀 Getting Started

### Installation

1. Clone the repository and navigate to the server directory:
```bash
cd TOEIC_server
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure environment variables in `.env`:
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/toeic_db

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_SECRET=your_refresh_token_secret

# Email Configuration
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Firebase Configuration
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_CLIENT_ID=your_client_id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token

# Web Push
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
```

### Database Setup

1. Ensure MongoDB is running locally or configure cloud connection
2. The application will automatically create collections and indexes on first run

### Development

Start the development server with auto-reload:
```bash
npm run dev
```

The server will be available at `http://localhost:5000`

### Build for Production

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

### API Documentation

Generate and view Swagger documentation:
```bash
npm run swagger:gen
```

Access documentation at `http://localhost:5000/api-docs`

## 📁 Project Structure

```
src/
├── controllers/         # Request handlers for API endpoints
├── services/           # Business logic layer
├── models/             # MongoDB schemas and models
├── routes/             # API route definitions
├── middlewares/        # Express middlewares
├── dto/                # Data Transfer Objects
├── utils/              # Utility functions
├── configs/            # Configuration files
├── socket/             # Socket.IO handlers
└── types/              # TypeScript type definitions
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 5000) |
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `EMAIL_USER` | Gmail username for notifications | Yes |
| `FIREBASE_*` | Firebase configuration | Yes |
| `VAPID_*` | Web Push VAPID keys | Yes |

### Firebase Setup

1. Create a Firebase project
2. Enable Cloud Storage
3. Generate a service account key
4. Configure storage rules for file uploads

### Email Configuration

For Gmail:
1. Enable 2-factor authentication
2. Generate an App Password
3. Use the App Password in `EMAIL_PASS`

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/forgot-password` - Password reset request

### User Management
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/progress` - Get learning progress

### Tests & Lessons
- `GET /api/tests` - Get available tests
- `POST /api/tests/:id/submit` - Submit test answers
- `GET /api/lessons` - Get lessons
- `GET /api/lessons/:id` - Get lesson details

### Vocabulary & Flashcards
- `GET /api/vocabulary` - Get vocabulary lists
- `POST /api/flashcards` - Create flashcard
- `GET /api/flashcards/progress` - Get flashcard progress

### Real-time Features
- WebSocket connections for live notifications
- Real-time test updates
- Live chat functionality

## 🔒 Security Features

- **Helmet.js**: Security headers
- **CORS**: Cross-origin resource sharing
- **JWT Authentication**: Secure token-based auth
- **Input Validation**: Zod schema validation
- **Rate Limiting**: Request rate limiting
- **Data Sanitization**: Input sanitization

## 📊 Monitoring & Logging

- **Winston Logger**: Structured logging with daily rotation
- **Error Handling**: Centralized error handling
- **Request Logging**: HTTP request logging
- **Performance Monitoring**: Response time tracking

## 🚀 Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure production database
- [ ] Set secure JWT secrets
- [ ] Configure production email service
- [ ] Set up Firebase production bucket
- [ ] Configure VAPID keys for push notifications
- [ ] Set up reverse proxy (nginx)
- [ ] Configure SSL certificates
- [ ] Set up monitoring and alerts

### Docker Support

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 5000
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 👥 Support

For support and questions, please contact the development team or create an issue in the repository.