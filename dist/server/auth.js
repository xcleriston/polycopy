var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/user.js';
const JWT_SECRET = process.env.JWT_SECRET || 'poly-hacker-secret-ultra-secure-2026';
export const generateToken = (user) => {
    return jwt.sign({ id: user._id, role: user.role, username: user.username || user.chatId }, JWT_SECRET, { expiresIn: '7d' });
};
export const authenticateToken = (req, res, next) => {
    const token = req.cookies.auth_token;
    if (!token) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Tokens de acesso ausentes ou expirados.' });
        }
        return res.redirect('/login');
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (error) {
        res.clearCookie('auth_token');
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Token inválido ou expirado.' });
        }
        res.redirect('/login');
    }
};
export const authorizeAdmin = (req, res, next) => {
    var _a;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        return res.status(403).json({ error: 'Acesso restrito a administradores.' });
    }
    next();
};
export const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { identity, password } = req.body; // identity can be email, username or chatId
    try {
        const user = yield User.findOne({
            $or: [
                { email: identity },
                { username: identity },
                { chatId: identity }
            ]
        });
        if (!user || !user.password) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }
        const isMatch = yield bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }
        const token = generateToken(user);
        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        res.json({
            success: true,
            role: user.role,
            username: user.username || user.chatId
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Erro no servidor durante o login.' });
    }
});
export const signup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username, email, password } = req.body;
    try {
        // Check if user exists
        const existing = yield User.findOne({ $or: [{ email }, { username }] });
        if (existing) {
            return res.status(400).json({ error: 'Usuário ou e-mail já cadastrado.' });
        }
        const hashedPassword = yield bcrypt.hash(password, 10);
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            role: 'follower', // ALWAYS follower for self-signup
            step: 'start', // Initial step for the wizard
            config: {
                enabled: false,
                strategy: 'PERCENTAGE',
                copySize: 10.0,
                traderAddress: ''
            }
        });
        yield newUser.save();
        const token = generateToken(newUser);
        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        res.json({ success: true, user: { username: newUser.username, role: newUser.role } });
    }
    catch (error) {
        res.status(500).json({ error: 'Erro ao criar usuário.' });
    }
});
