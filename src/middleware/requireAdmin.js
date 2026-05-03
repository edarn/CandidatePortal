export function requireAdmin(req, res, next) {
  if (req.session?.user?.role === 'admin') return next();
  if (req.method === 'GET') {
    req.session.returnTo = req.originalUrl;
  }
  return res.redirect('/admin/login');
}
