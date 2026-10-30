import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../database/connection.js';
import { config } from '../config/index.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
      return;
    }

    const user = await db.get(
      'SELECT id, name, username, password_hash, role FROM users WHERE username = ?',
      [username]
    );

    if (!user) {
      res.status(401).json({ error: 'Credenciais inválidas.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: 'Credenciais inválidas.' });
      return;
    }

    const payload = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    };

    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });

    res.json({
      message: 'Autenticação realizada com sucesso.',
      token,
      user: payload
    });
  } catch (err: any) {
    console.error('[Auth Route Error]', err);
    res.status(500).json({ error: 'Erro interno ao processar autenticação.' });
  }
});

// Current User Profile
router.get('/me', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await db.get(
      'SELECT id, name, username, role, created_at FROM users WHERE id = ?',
      [req.user!.id]
    );

    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    res.json({ user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Change Password
router.post('/change-password', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias.' });
      return;
    }

    const user = await db.get('SELECT password_hash FROM users WHERE id = ?', [req.user!.id]);
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      res.status(400).json({ error: 'Senha atual incorreta.' });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.run(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newHash, req.user!.id]
    );

    res.json({ message: 'Senha alterada com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
