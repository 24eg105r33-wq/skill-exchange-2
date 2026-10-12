# Student Skill Exchange Backend

Spring Boot REST API and MySQL schema for the Student Skill Exchange frontend.

## Requirements

- Java 21
- Maven 3.9+
- MySQL 8.x

## Run locally

Set database credentials in PowerShell for the current terminal:

```powershell
$env:DB_USERNAME="root"
$env:DB_PASSWORD="YOUR_MYSQL_PASSWORD"
```

Do not commit database credentials. If the local MySQL root account has no password, leave `DB_PASSWORD` unset.

Start the API from this repository:

```powershell
mvn clean package
mvn spring-boot:run
```

The application creates `student_skill_exchange_new` when needed and initializes missing tables from `src/main/resources/schema.sql`. It does not drop existing tables.

Health check: <http://localhost:8080/api/health>

## Related repository

Frontend: <https://github.com/24eg105r33-wq/frontend>

## Security note

This is a student-project MVP, not production-grade authentication. Login state is kept in browser local storage, and API endpoints currently trust the submitted student ID. Add server-side session/JWT authorization before deploying publicly.
