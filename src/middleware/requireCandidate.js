export function requireCandidate(req, res, next) {
  if (req.session?.user?.role === 'candidate') return next();
  if (req.method === 'GET') {
    req.session.returnTo = req.originalUrl;
  }
  return res.redirect('/login');
}
