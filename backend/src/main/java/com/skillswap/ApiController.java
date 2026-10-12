package com.skillswap;

import java.util.List;
import java.util.Map;
import java.util.HashMap;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class ApiController {
    private final JdbcTemplate db;
    private final PasswordEncoder encoder;
    public ApiController(JdbcTemplate db, PasswordEncoder encoder) { this.db = db; this.encoder = encoder; }

    @GetMapping("/health") public Map<String,Object> health() {
        Integer one = db.queryForObject("SELECT 1", Integer.class);
        return Map.of("status", "ok", "database", one != null && one == 1 ? "connected" : "unknown");
    }

    @PostMapping("/auth/register") public Map<String,Object> register(@RequestBody RegisterInput in) {
        String name = clean(in.fullName()); String email = clean(in.email()).toLowerCase();
        String password = in.password() == null ? "" : in.password();
        String year = clean(in.yearOfStudy()); String department = clean(in.department());
        if (name.isBlank() || email.isBlank() || password.length() < 6 || year.isBlank() || department.isBlank())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Fill in all fields. Password must contain at least 6 characters.");
        try {
            db.update("INSERT INTO users(full_name,email,password_hash,year_of_study,department) VALUES(?,?,?,?,?)",
                name, email, encoder.encode(password), year, department);
        } catch (DuplicateKeyException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account with this email already exists.");
        }
        Long id = db.queryForObject("SELECT id FROM users WHERE email=?", Long.class, email);
        return userById(id);
    }

    @PostMapping("/auth/login") public Map<String,Object> login(@RequestBody LoginInput in) {
        List<Map<String,Object>> rows = db.queryForList("SELECT id,full_name,email,password_hash,year_of_study,department FROM users WHERE email=?", clean(in.email()).toLowerCase());
        if (rows.isEmpty() || in.password() == null || !encoder.matches(in.password(), String.valueOf(rows.get(0).get("password_hash"))))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect email or password.");
        Map<String,Object> row = rows.get(0); row.remove("password_hash"); return row;
    }

    @GetMapping("/skills") public List<Map<String,Object>> skills(@RequestParam(required=false) String q, @RequestParam(required=false) String type) {
        String search = q == null ? "" : q.trim(); String skillType = type == null ? "" : type.trim();
        return db.queryForList("SELECT s.id,s.student_id AS studentId,u.full_name AS studentName,u.department,s.skill_name AS skillName,s.skill_type AS skillType,s.description,s.created_at AS createdAt FROM skills s JOIN users u ON u.id=s.student_id WHERE (?='' OR s.skill_name LIKE ? OR s.description LIKE ? OR u.full_name LIKE ?) AND (?='' OR s.skill_type=?) ORDER BY s.created_at DESC",
            search, "%"+search+"%", "%"+search+"%", "%"+search+"%", skillType, skillType);
    }

    @PostMapping("/skills") public Map<String,Object> addSkill(@RequestBody SkillInput in) {
        if (in.studentId() == null || in.studentId() < 1 || clean(in.skillName()).isBlank() || clean(in.description()).isBlank())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide your account, skill name, and description.");
        String type = clean(in.skillType()).toUpperCase();
        if (!type.equals("TEACH") && !type.equals("LEARN")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Skill type must be TEACH or LEARN.");
        requireUser(in.studentId());
        db.update("INSERT INTO skills(student_id,skill_name,skill_type,description) VALUES(?,?,?,?)", in.studentId(), clean(in.skillName()), type, clean(in.description()));
        Long id = db.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        return db.queryForMap("SELECT s.id,s.student_id AS studentId,u.full_name AS studentName,u.department,s.skill_name AS skillName,s.skill_type AS skillType,s.description,s.created_at AS createdAt FROM skills s JOIN users u ON u.id=s.student_id WHERE s.id=?", id);
    }

    @PostMapping("/requests") public Map<String,Object> createRequest(@RequestBody RequestInput in) {
        if (in.skillId() == null || in.requesterId() == null || in.message() == null || in.message().isBlank())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a skill and enter a message.");
        requireUser(in.requesterId());
        List<Map<String,Object>> skill = db.queryForList("SELECT student_id FROM skills WHERE id=?", in.skillId());
        if (skill.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "That skill listing no longer exists.");
        if (((Number)skill.get(0).get("student_id")).longValue() == in.requesterId()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot request your own skill listing.");
        db.update("INSERT INTO exchange_requests(skill_id,requester_id,message) VALUES(?,?,?)", in.skillId(), in.requesterId(), in.message().trim());
        Long id = db.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        return db.queryForMap("SELECT r.id,r.skill_id AS skillId,r.requester_id AS requesterId,r.message,r.status,r.created_at AS createdAt,s.skill_name AS skillName,u.full_name AS requesterName FROM exchange_requests r JOIN skills s ON s.id=r.skill_id JOIN users u ON u.id=r.requester_id WHERE r.id=?", id);
    }

    @GetMapping("/requests") public List<Map<String,Object>> requests(@RequestParam Long studentId) {
        requireUser(studentId);
        return db.queryForList("SELECT r.id,r.skill_id AS skillId,r.requester_id AS requesterId,r.message,r.status,r.created_at AS createdAt,s.skill_name AS skillName,s.student_id AS ownerId,owner.full_name AS ownerName,requester.full_name AS requesterName FROM exchange_requests r JOIN skills s ON s.id=r.skill_id JOIN users owner ON owner.id=s.student_id JOIN users requester ON requester.id=r.requester_id WHERE s.student_id=? OR r.requester_id=? ORDER BY r.created_at DESC", studentId, studentId);
    }

    @PutMapping("/requests/{id}/status") public Map<String,Object> updateRequest(@PathVariable Long id, @RequestBody StatusInput in) {
        String status = clean(in.status()).toUpperCase();
        if (!List.of("ACCEPTED", "REJECTED", "COMPLETED").contains(status)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid request status.");
        int changed = db.update("UPDATE exchange_requests SET status=? WHERE id=? AND EXISTS (SELECT 1 FROM skills s WHERE s.id=exchange_requests.skill_id AND s.student_id=?)", status, id, in.studentId());
        if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Request not found or you are not allowed to update it.");
        return db.queryForMap("SELECT id,status,message FROM exchange_requests WHERE id=?", id);
    }


@PostMapping("/feedback")
public Map<String, Object> feedback(@RequestBody FeedbackInput in) {

    if (in.requestId() == null ||
        in.studentId() == null ||
        in.rating() == null ||
        in.rating() < 1 ||
        in.rating() > 5 ||
        in.comment() == null ||
        in.comment().isBlank()) {

        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "Provide a request, rating from 1 to 5, and comment."
        );
    }

    requireUser(in.studentId());

    // Check that the exchange is completed and the student
    // is either the requester or the skill owner.
    Integer allowed = db.queryForObject(
        "SELECT COUNT(*) " +
        "FROM exchange_requests r " +
        "JOIN skills s ON s.id = r.skill_id " +
        "WHERE r.id = ? " +
        "AND r.status = 'COMPLETED' " +
        "AND (r.requester_id = ? OR s.student_id = ?)",
        Integer.class,
        in.requestId(),
        in.studentId(),
        in.studentId()
    );

    if (allowed == null || allowed == 0) {
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "You can give feedback only for a completed exchange you participated in."
        );
    }

    // Prevent duplicate feedback by the same student.
    Integer duplicate = db.queryForObject(
        "SELECT COUNT(*) FROM feedback " +
        "WHERE request_id = ? AND student_id = ?",
        Integer.class,
        in.requestId(),
        in.studentId()
    );

    if (duplicate != null && duplicate > 0) {
        throw new ResponseStatusException(
            HttpStatus.CONFLICT,
            "You have already submitted feedback for this exchange."
        );
    }

    db.update(
        "INSERT INTO feedback(request_id, student_id, rating, comment) " +
        "VALUES (?, ?, ?, ?)",
        in.requestId(),
        in.studentId(),
        in.rating(),
        in.comment().trim()
    );

    return Map.of(
        "message",
        "Feedback submitted successfully."
    );
}

    private void requireUser(Long id) {
        Integer count = db.queryForObject("SELECT COUNT(*) FROM users WHERE id=?", Integer.class, id);
        if (count == null || count == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Student account not found. Please register or log in again.");
    }
    private Map<String,Object> userById(Long id) { return db.queryForMap("SELECT id,full_name AS fullName,email,year_of_study AS yearOfStudy,department FROM users WHERE id=?", id); }
    private String clean(String value) { return value == null ? "" : value.trim(); }

    public record RegisterInput(String fullName, String email, String password, String yearOfStudy, String department) {}
    public record LoginInput(String email, String password) {}
    public record SkillInput(Long studentId, String skillName, String skillType, String description) {}
    public record RequestInput(Long skillId, Long requesterId, String message) {}
    public record StatusInput(Long studentId, String status) {}
    public record FeedbackInput(Long requestId, Long studentId, Integer rating, String comment) {}
}
