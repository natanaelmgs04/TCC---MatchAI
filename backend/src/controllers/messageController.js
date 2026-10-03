import Message from "../models/Message.js";
import { avatarPath } from "../services/avatar.js";
import User from "../models/User.js";
import { newMessageEmail } from "../services/emailService.js";
import { notify } from "../services/notificationService.js";

export async function sendMessage(req, res) {
  const { to, text } = req.body;
  if (!to || !text?.trim())
    return res.status(400).json({ error: "Destinatário e texto são obrigatórios" });
  const message = await Message.create({ from: req.user.id, to, text: text.trim() });
  res.status(201).json(message);

  const recipient = await User.findById(to);
  if (recipient) {
    newMessageEmail(recipient, req.user.name, message.text).catch(() => {});
    notify(to, "message", `Nova mensagem de ${req.user.name}`, `dashboard.html`);
  }
}

export async function getConversation(req, res) {
  const otherId = req.params.userId;
  const messages = await Message.find({
    $or: [
      { from: req.user.id, to: otherId },
      { from: otherId, to: req.user.id },
    ],
  }).sort("createdAt");
  await Message.updateMany(
    { from: otherId, to: req.user.id, read: false },
    { $set: { read: true } },
  );
  res.json(messages);
}

export async function listConversations(req, res) {
  const messages = await Message.find({
    $or: [{ from: req.user.id }, { to: req.user.id }],
  })
    .populate("from", "name role avatarVersion")
    .populate("to", "name role avatarVersion")
    .sort("-createdAt");

  const seen = new Map();
  for (const m of messages) {
    const isMine = String(m.from.id) === String(req.user.id);
    const other = isMine ? m.to : m.from;
    const key = String(other.id);
    if (!seen.has(key)) {
      seen.set(key, {
        userId: key,
        name: other.name,
        role: other.role,
        avatar: avatarPath(other),
        lastMessage: m.text,
        lastMessageAt: m.createdAt,
        unreadCount: 0,
      });
    }
    if (!isMine && !m.read) seen.get(key).unreadCount += 1;
  }
  res.json(Array.from(seen.values()));
}

export async function unreadCount(req, res) {
  const count = await Message.countDocuments({ to: req.user.id, read: false });
  res.json({ count });
}
