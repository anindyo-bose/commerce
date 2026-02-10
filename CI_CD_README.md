# CI/CD Pipeline Documentation

## Overview

This project uses GitHub Actions for continuous integration and deployment. The pipeline automatically tests, builds, and deploys the application to staging and production environments.

## Workflows

### 1. Continuous Integration (`ci.yml`)

**Triggers**:
- Pull requests to `main` or `develop` branches
- Direct pushes to `main` or `develop` branches

**Dependency Installation**:
- Currently uses `npm install` (works without lock files)
- Once `package-lock.json` files are committed, update to `npm ci` for faster, deterministic installs
- Enable caching by adding `cache: 'npm'` to `setup-node` steps after lock files exist

**Jobs**:

#### Lint Jobs
- **lint-backend**: ESLint and Prettier checks for backend TypeScript code
- **lint-frontend**: ESLint checks for all 7 frontend MFEs in parallel

#### Test Jobs
- **test-backend**: Runs unit, integration, and E2E tests with PostgreSQL and Redis services
  - Migrations executed before tests
  - Coverage report uploaded to Codecov
  - Requires 95% test coverage
- **test-frontend**: Tests all 7 MFEs in parallel with coverage reporting

#### Build Jobs
- **build-backend**: Compiles TypeScript to JavaScript, uploads artifacts
- **build-frontend**: Builds all MFEs for production, uploads artifacts

#### Security Jobs
- **security-scan**: Runs npm audit and Snyk vulnerability scanning
  - Blocks deployment on high/critical vulnerabilities

#### Docker Jobs
- **docker-build**: Builds and pushes Docker images to registry (only on `main`/`develop` branches)

**Status**: ✅ All jobs must pass before merge is allowed

---

### 2. Deployment (`deploy.yml`)

**Triggers**:
- Push to `main` branch → Auto-deploy to **staging**
- Tag `v*.*.*` → Deploy to **production** (manual approval required)
- Manual workflow dispatch → Choose environment

**Environments**:
- **Staging**: `staging.commerce.example.com`
- **Production**: `commerce.example.com`

**Jobs**:

#### Build and Push
- Builds Docker images for all services (backend + 7 MFEs)
- Pushes to GitHub Container Registry (GHCR)
- Tags with version, SHA, and environment

#### Deploy to Staging
- Automatically deploys on `main` branch push
- Updates Kubernetes deployments
- Runs database migrations
- Executes smoke tests
- No approval required

#### Deploy to Production
- Requires manual approval in GitHub UI
- Creates database backup before deployment
- Rolling update with health checks
- Post-deployment validation tests
- Sends Slack notification on success

#### Rollback
- Automatically triggers on production deployment failure
- Reverts Kubernetes deployments to previous version
- Sends Slack alert

---

## Prerequisites

### GitHub Secrets

Configure these secrets in GitHub repository settings (`Settings → Secrets and variables → Actions`):

**Docker Registry**:
- `DOCKER_USERNAME`: Docker Hub username (or use GitHub actor for GHCR)
- `DOCKER_PASSWORD`: Docker Hub password (or use `GITHUB_TOKEN` for GHCR)

**AWS Credentials** (for Kubernetes deployment):
- `AWS_ACCESS_KEY_ID`: AWS access key with EKS permissions
- `AWS_SECRET_ACCESS_KEY`: AWS secret access key

**Database**:
- `STAGING_DATABASE_URL`: PostgreSQL connection string for staging
- `PRODUCTION_DATABASE_URL`: PostgreSQL connection string for production

**Monitoring**:
- `SNYK_TOKEN`: Snyk API token for security scanning
- `SLACK_WEBHOOK_URL`: Slack webhook for deployment notifications

**Optional**:
- `CODECOV_TOKEN`: Codecov API token (can use GitHub App instead)

---

## Local Development with Docker

### Quick Start

```bash
# Start all services (backend + frontend + PostgreSQL + Redis + utilities)
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop all services
docker-compose down

# Rebuild after code changes
docker-compose up -d --build
```

### Services and Ports

| Service | Port | URL | Credentials |
|---------|------|-----|-------------|
| Backend API | 3100 | http://localhost:3100 | N/A |
| Host Shell (Frontend) | 3000 | http://localhost:3000 | N/A |
| Auth MFE | 3001 | http://localhost:3001 | N/A |
| Product MFE | 3002 | http://localhost:3002 | N/A |
| Cart MFE | 3003 | http://localhost:3003 | N/A |
| Order MFE | 3004 | http://localhost:3004 | N/A |
| Seller MFE | 3005 | http://localhost:3005 | N/A |
| Admin MFE | 3006 | http://localhost:3006 | N/A |
| PostgreSQL | 5432 | localhost:5432 | postgres / postgres123 |
| Redis | 6379 | localhost:6379 | Password: redis123 |
| pgAdmin | 5050 | http://localhost:5050 | admin@commerce.local / admin123 |
| Redis Commander | 8081 | http://localhost:8081 | N/A (auto-connects to Redis) |
| MailHog SMTP | 1025 | localhost:1025 | N/A |
| MailHog Web UI | 8025 | http://localhost:8025 | View test emails |

### Database Setup

```bash
# Run migrations
docker-compose exec backend npm run migration:run

# Seed initial data
docker-compose exec backend npm run seed

# Create new migration
docker-compose exec backend npm run migration:generate -- -n MigrationName

# Rollback last migration
docker-compose exec backend npm run migration:revert
```

### Debugging

```bash
# Check service health
docker-compose ps

# View backend logs
docker-compose logs -f backend

# Access PostgreSQL CLI
docker-compose exec postgres psql -U postgres -d commerce_dev

# Access Redis CLI
docker-compose exec redis redis-cli -a redis123

# Restart specific service
docker-compose restart backend
```

---

## Deployment Guide

### Staging Deployment

**Automatic** on every push to `main`:

```bash
git checkout main
git merge develop
git push origin main
# GitHub Actions automatically deploys to staging
```

**Manual** via workflow dispatch:

1. Go to GitHub Actions tab
2. Select "Deploy to Production" workflow
3. Click "Run workflow"
4. Choose `staging` environment
5. Click "Run workflow" button

### Production Deployment

**Recommended** (tagged release):

```bash
# Create and push a version tag
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0

# GitHub Actions triggers production deployment workflow
# Requires manual approval in GitHub UI
```

**Manual Approval**:

1. GitHub Actions pauses at production environment gate
2. Navigate to Actions → Workflow run
3. Click "Review deployments"
4. Select "production" environment
5. Click "Approve and deploy"

### Rollback

**Automatic** on deployment failure (Kubernetes-level):

```bash
# If deployment health checks fail, automatic rollback occurs
# Check Slack notification for rollback confirmation
```

**Manual** rollback via kubectl:

```bash
# Configure kubectl for EKS cluster
aws eks update-kubeconfig --name commerce-production-cluster --region us-east-1

# Rollback backend
kubectl rollout undo deployment/commerce-backend -n production

# Rollback specific MFE
kubectl rollout undo deployment/commerce-host-shell -n production

# Check rollout status
kubectl rollout status deployment/commerce-backend -n production
```

---

## Monitoring and Alerts

### CI Pipeline Monitoring

- **GitHub Actions UI**: Real-time job status and logs
- **Codecov Dashboard**: Test coverage trends
- **Snyk Dashboard**: Vulnerability reports

### Deployment Monitoring

- **Kubernetes Dashboard**: Pod health and resource usage
  ```bash
  kubectl get pods -n production
  kubectl describe deployment commerce-backend -n production
  ```

- **Application Logs**:
  ```bash
  kubectl logs -f deployment/commerce-backend -n production
  ```

- **Health Checks**:
  ```bash
  curl https://commerce.example.com/health
  curl https://staging.commerce.example.com/health
  ```

### Slack Notifications

Production deployments send Slack notifications to configured webhook:
- ✅ **Success**: Deployment version, deployed by, commit SHA
- ⚠️ **Rollback**: Failed version, error details

---

## Troubleshooting

### CI Pipeline Issues

**Problem**: "The npm ci command can only install with an existing package-lock.json"

**Solution**: The workflow now uses `npm install` instead of `npm ci` to work without lock files. Once you add lock files, optimize the workflow:

```bash
# Generate package-lock.json files
cd backend && npm install
cd ../frontend/host-shell && npm install
cd ../auth-mfe && npm install
cd ../product-mfe && npm install
cd ../cart-mfe && npm install
cd ../order-mfe && npm install
cd ../seller-mfe && npm install
cd ../admin-mfe && npm install

# Commit all lock files
git add **/package-lock.json
git commit -m "Add package-lock.json files"
git push
```

Then optimize `.github/workflows/ci.yml` for production:
1. Change `npm install` → `npm ci` (faster, deterministic)
2. Add `cache: 'npm'` to all `setup-node@v4` steps (2-5x faster builds)

**Problem**: Tests failing in CI but passing locally

**Solution**:
```bash
# Ensure local environment matches CI
docker-compose down -v  # Reset volumes
docker-compose up -d postgres redis
npm run test:ci
```

**Problem**: Security scan blocking merge

**Solution**:
```bash
# Check vulnerabilities locally
npm audit

# Fix automatically if possible
npm audit fix

# Check Snyk dashboard for details
```

### Deployment Issues

**Problem**: Deployment stuck on "Waiting for approval"

**Solution**: Check GitHub Actions UI for approval button (production only)

**Problem**: Health check failing after deployment

**Solution**:
```bash
# Check pod logs
kubectl logs -f deployment/commerce-backend -n production --tail=100

# Check pod status
kubectl get pods -n production

# Describe pod for events
kubectl describe pod <pod-name> -n production
```

**Problem**: Database migration failed

**Solution**:
```bash
# Check migration logs
kubectl logs job/migration-<sha> -n production

# Rollback migration
kubectl exec -it deployment/commerce-backend -n production -- npm run migration:revert

# Restore from backup (if needed)
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier commerce-production-restored \
  --db-snapshot-identifier pre-deploy-<sha>
```

---

## Best Practices

### Development

1. **Always run tests locally** before pushing:
   ```bash
   npm run test
   npm run lint
   ```

2. **Keep main branch deployable**: Merge only stable code to `main`

3. **Use feature branches**: Create branches from `develop` for new features

4. **Write meaningful commit messages**: Follow conventional commits format

### Deployment

1. **Deploy to staging first**: Always test in staging before production

2. **Tag releases**: Use semantic versioning for production deployments

3. **Monitor after deployment**: Watch logs and metrics for 15-30 minutes

4. **Have rollback plan ready**: Know how to rollback if issues arise

5. **Deploy during low-traffic periods**: Production deployments during maintenance window (Sundays 2-6 AM UTC)

### Security

1. **Never commit secrets**: Use GitHub Secrets or environment variables

2. **Keep dependencies updated**: Review Dependabot PRs weekly

3. **Fix high/critical vulnerabilities**: Address security issues immediately

4. **Rotate credentials regularly**: Update secrets quarterly

---

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Documentation](https://docs.docker.com/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [AWS EKS Documentation](https://docs.aws.amazon.com/eks/)

---

**Last Updated**: February 10, 2026  
**Maintained By**: DevOps Team
