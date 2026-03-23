# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

To report a security vulnerability, please email: **security@aimleads.io**

Include the following in your report:
- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- Any proof-of-concept code
- Your contact information for follow-up

### What to expect

- Acknowledgment within **48 hours**
- A detailed response within **7 days** with our assessment
- A fix or mitigation timeline communicated within **14 days**
- Credit in the security advisory (optional, upon your request)

## Security Measures

This application implements the following security controls:

### Authentication & Authorization
- Session tokens with cryptographically secure secrets (`SESSION_SECRET`)
- Account lockout after 5 failed login attempts (15-minute window)
- Rate limiting on all authentication endpoints
- Password minimum complexity: 8+ chars, 1 uppercase, 1 number
- Supabase RLS (Row Level Security) enforced on all data tables

### API Security
- CORS configured with allowlist (`CORS_ORIGIN`)
- Security headers: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- Request ID propagation for audit tracing
- Input validation via Zod schemas on all API endpoints

### Data Protection
- All database queries scoped to `workspace_id` (tenant isolation)
- Audit log for all destructive operations (DELETE)
- No sensitive data logged to console in production

### Infrastructure
- Serverless deployment on Vercel (Node.js 20.x)
- Environment variables for all secrets (never committed to source)
- `maxDuration: 60s` on API functions to prevent resource exhaustion

## Responsible Disclosure

We follow a responsible disclosure policy. We ask security researchers to:
1. Give us reasonable time to address vulnerabilities before public disclosure
2. Avoid accessing or modifying data that does not belong to you
3. Not perform DoS/DDoS attacks against our infrastructure
4. Not exploit the vulnerability beyond what is necessary to demonstrate it

Thank you for helping keep AimLeads secure.
