import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.JWT_SECRET;

export function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    return decoded;
  } catch (error) {
    throw new Error('Invalid token');
  }
}
