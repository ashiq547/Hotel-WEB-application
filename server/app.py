"""FastAPI entry point: python -m uvicorn app:app --port 5001."""
import logging
import os
from datetime import datetime, timezone
import pymysql
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from db import get_db
from auth_api import router as auth_router
from api import router as operations_router

app = FastAPI(title='Hotel Management System API', version='2.0.0', redirect_slashes=True)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5173').split(','),
                   allow_credentials=True, allow_methods=['*'], allow_headers=['*'])

@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return JSONResponse({'error': exc.detail}, status_code=exc.status_code, headers=exc.headers)

@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse({'error': 'Invalid request', 'details': exc.errors()}, status_code=400)

@app.exception_handler(pymysql.MySQLError)
async def database_error(request: Request, exc: pymysql.MySQLError):
    code = exc.args[0] if exc.args else 0
    status = 409 if code in (1062, 1451, 1452) else 400 if code == 1644 else 500
    logging.exception('Database request failed')
    message = str(exc.args[1]) if status < 500 and len(exc.args) > 1 else 'Database request failed'
    return JSONResponse({'error': message}, status_code=status)

@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    logging.exception('API request failed')
    return JSONResponse({'error': 'Internal Server Error'}, status_code=500)

@app.get('/api/health')
def health():
    return {'status': 'OK', 'timestamp': datetime.now(timezone.utc), 'message': 'Hotel Management System Backend API is active'}

app.include_router(auth_router)
app.include_router(operations_router)

if __name__ == '__main__':
    import uvicorn
    uvicorn.run('app:app', host='0.0.0.0', port=int(os.getenv('PORT', '5001')), timeout_keep_alive=65)