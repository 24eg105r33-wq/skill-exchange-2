# Student Skill Exchange Platform (Java + Spring Boot + MySQL)

A clean starter project with a static HTML/CSS/JavaScript frontend, Java 21 + Spring Boot REST API, and MySQL database. It includes student registration/login, skill listings, exchange requests, request accept/reject, and a health check.

## Requirements
- Java 21
- Maven 3.9+
- MySQL 8.x
- VS Code (optional)

## 1. Create the database
The JDBC URL includes `createDatabaseIfNotExist=true`. For a standard local MySQL root account, the app can create `student_skill_exchange_new` automatically. If your root account has a password, set it before starting the backend.

PowerShell, for the current terminal only:

```powershell
$env:DB_USERNAME="root"
$env:DB_PASSWORD="YOUR_MYSQL_PASSWORD"
```

Do not put your password in source code or send it to anyone. If your MySQL root account has no password, leave `DB_PASSWORD` unset.

## 2. Start backend
Open a terminal in the `backend` folder and run:

```powershell
mvn clean package
mvn spring-boot:run
```

The first run needs internet access so Maven can download dependencies. Successful startup should show `Tomcat started on port 8080`.

Test the API in your browser: http://localhost:8080/api/health
Expected response includes `"status": "ok"` and `"database": "connected"`.

## 3. Start frontend
Open the `frontend` folder in VS Code. Install the VS Code extension **Live Server** if needed. Right-click `index.html` → **Open with Live Server**. Use the address `http://127.0.0.1:5500` or `http://localhost:5500`.

Keep the backend terminal running while using the site.

## Build with GitHub Actions
The `Build project` workflow runs automatically when you push a commit or open a pull request. It starts a temporary MySQL service, builds the backend, launches it, and checks that `/api/health` reports both the API and database as healthy. You can also start the workflow manually from the repository's **Actions** tab. A successful run saves the backend JAR as an artifact; download it from that workflow run's **Artifacts** section.

## Publish online with Railway
GitHub Actions builds and tests the project; it does not keep it running as a website. The root `Dockerfile` packages the frontend into the Spring Boot app so Railway can serve the frontend and API from the same public URL.

1. Create a GitHub repository and push this project to it. From PowerShell in the project folder, after creating an empty repository on GitHub, run these commands with your repository URL:

   ```powershell
   git add .
   git commit -m "Prepare app for Railway deployment"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
   git push -u origin main
   ```

2. In Railway, create a project, add a **MySQL** service, and add a service deployed from your GitHub repository. Railway will build the root `Dockerfile`.
3. In the app service's **Variables**, add the following. If you named the database service something other than `MySQL`, replace `MySQL` in the Railway references with its service name.

   ```text
   DB_URL=jdbc:mysql://${{MySQL.MYSQLHOST}}:${{MySQL.MYSQLPORT}}/${{MySQL.MYSQLDATABASE}}?createDatabaseIfNotExist=true&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
   DB_USERNAME=${{MySQL.MYSQLUSER}}
   DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
   ```

   These are Railway variable references, not literal credentials. Do not commit database passwords or paste them into source files.
4. Set the app service's health check path to `/api/health`, deploy, then generate a public domain in Railway's **Networking** settings. Open that domain; the API health URL is the same domain followed by `/api/health`.

The deployment requires your own GitHub and Railway accounts. GitHub Actions and Railway deployments begin only after you push the project to a GitHub repository.

## Main API endpoints
- `GET /api/health`
- `POST /api/auth/register` — `fullName`, `email`, `password`, `yearOfStudy`, `department`
- `POST /api/auth/login` — `email`, `password`
- `GET /api/skills` — optional `q` and `type` query parameters
- `POST /api/skills` — `studentId`, `skillName`, `skillType` (`TEACH` or `LEARN`), `description`
- `GET /api/requests?studentId=ID`
- `POST /api/requests` — `skillId`, `requesterId`, `message`
- `PUT /api/requests/{id}/status` — `studentId`, `status` (`ACCEPTED`, `REJECTED`, `COMPLETED`)
- `POST /api/feedback` — `requestId`, `studentId`, `rating`, `comment`

## Important notes
- This is a student-project MVP, not production-grade authentication. Login state is kept in browser local storage; the backend hashes passwords with BCrypt, but API endpoints currently trust the submitted student ID. Add server-side session/JWT authorization before deploying publicly.
- The project uses its own `student_skill_exchange_new` database, leaving your previous database untouched.
- `year_of_study` is a string, so values such as `Staff / Faculty` are supported.
- The backend initializes missing tables using `CREATE TABLE IF NOT EXISTS`. It does not drop existing tables.
- If the app cannot connect, check MySQL is running and the username/password environment variables are correct. Do not share your database password.
