function errorHandler(err, req, res, next) {
  console.error('API Error:', err.stack || err.message || err);
  
  // Mysql trigger or custom signal error
  if (err.sqlState === '45000') {
    return res.status(400).json({ error: err.message });
  }

  const statusCode = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode <= 599
    ? err.statusCode
    : Number.isInteger(err.status) && err.status >= 400 && err.status <= 599
      ? err.status
      : 500;
  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal Server Error' : (err.message || 'Request failed')
  });
}

module.exports = errorHandler;
