<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

$host = 'localhost';
$dbname = 'kz801xs_swotdb'; 
$user = 'kz801xs_692';     
$pass = 'W|x7<J!BGGpG';     

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    ensureSchema($pdo);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => "DB connection failed: " . $e->getMessage()]);
    exit;
}

function ensureSchema($pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS swot_system_state (id INT PRIMARY KEY, db_data LONGTEXT, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS users_new (id VARCHAR(50) PRIMARY KEY, name VARCHAR(100), dept VARCHAR(100), team VARCHAR(100), password VARCHAR(255), secret VARCHAR(255), role VARCHAR(50) DEFAULT '一般', isAdmin TINYINT(1) DEFAULT 0, position VARCHAR(50) DEFAULT 'member', createdAt VARCHAR(50)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS interviews_new (interviewId VARCHAR(50) PRIMARY KEY, tag VARCHAR(255), scope VARCHAR(50), questionAI VARCHAR(50), analysisAI VARCHAR(50), questionCount INT, createdAt VARCHAR(50)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS questions_new (id VARCHAR(50) PRIMARY KEY, interviewId VARCHAR(50), text TEXT, axis VARCHAR(10), INDEX idx_interview (interviewId)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS answers_new (answerId VARCHAR(50) PRIMARY KEY, interviewId VARCHAR(50), userId VARCHAR(50), name VARCHAR(100), dept VARCHAR(100), role VARCHAR(100), responses LONGTEXT, answeredAt VARCHAR(50), INDEX idx_interview_user (interviewId, userId)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS allowed_users_new (id VARCHAR(50) PRIMARY KEY, name VARCHAR(100), fullId VARCHAR(255)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS analyses_new (analysisId VARCHAR(150) PRIMARY KEY, interviewId VARCHAR(50), generatedAt VARCHAR(50), scope VARCHAR(50), title VARCHAR(255), targetName VARCHAR(255), respondentCount INT DEFAULT 0, providerUsed VARCHAR(50), targetUserId VARCHAR(50), targetDept VARCHAR(100), targetTeam VARCHAR(100), swot LONGTEXT, notes TEXT, INDEX idx_interview (interviewId)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // answers_new が旧スキーマ（answerId列なし）の場合は再作成する
    try {
        $ansCols = $pdo->query("SHOW COLUMNS FROM answers_new")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('answerId', $ansCols)) {
            // 旧テーブルをバックアップとして保存し、正しいスキーマで再作成
            $pdo->exec("RENAME TABLE answers_new TO answers_old_backup");
            $pdo->exec("CREATE TABLE answers_new (answerId VARCHAR(150) PRIMARY KEY, interviewId VARCHAR(50), scope VARCHAR(20), userId VARCHAR(50), name VARCHAR(100), dept VARCHAR(100), role VARCHAR(100), responses LONGTEXT, answeredAt VARCHAR(50), INDEX idx_interview_user (interviewId, userId)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        }
    } catch (Exception $e) {
        error_log("answers_new migration error: " . $e->getMessage());
    }

    // Existing table migration for newly added columns
    try {
        $existingCols = $pdo->query("SHOW COLUMNS FROM users_new")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('password', $existingCols)) $pdo->exec("ALTER TABLE users_new ADD COLUMN password VARCHAR(255)");
        if (!in_array('secret', $existingCols)) $pdo->exec("ALTER TABLE users_new ADD COLUMN secret VARCHAR(255)");
        if (!in_array('role', $existingCols)) $pdo->exec("ALTER TABLE users_new ADD COLUMN role VARCHAR(50) DEFAULT '一般'");
        if (!in_array('isAdmin', $existingCols)) $pdo->exec("ALTER TABLE users_new ADD COLUMN isAdmin TINYINT(1) DEFAULT 0");
        if (!in_array('position', $existingCols)) $pdo->exec("ALTER TABLE users_new ADD COLUMN position VARCHAR(50) DEFAULT 'member'");
        if (!in_array('createdAt', $existingCols)) $pdo->exec("ALTER TABLE users_new ADD COLUMN createdAt VARCHAR(50)");
        if (!in_array('updatedAt', $existingCols)) $pdo->exec("ALTER TABLE users_new ADD COLUMN updatedAt VARCHAR(50)");
    } catch (Exception $e) {
        error_log("Schema update error: " . $e->getMessage());
        throw $e;
    }

    // answers_new の重複回答（同一 interviewId + userId）を統合する
    try {
        $dups = $pdo->query("
            SELECT interviewId, userId, COUNT(*) as cnt
            FROM answers_new
            GROUP BY interviewId, userId
            HAVING cnt > 1
        ")->fetchAll();

        foreach ($dups as $dup) {
            $rows = $pdo->prepare("
                SELECT * FROM answers_new
                WHERE interviewId = ? AND userId = ?
                ORDER BY answeredAt DESC
            ");
            $rows->execute([$dup['interviewId'], $dup['userId']]);
            $records = $rows->fetchAll();

            // 全レコードの responses を questionId でマージ（最新回答を優先）
            $merged = [];
            foreach (array_reverse($records) as $rec) {
                $resps = json_decode($rec['responses'] ?? '[]', true);
                foreach ($resps as $r) {
                    $merged[$r['questionId']] = $r['text'];
                }
            }
            $mergedArr = [];
            foreach ($merged as $qid => $text) {
                $mergedArr[] = ['questionId' => $qid, 'text' => $text];
            }

            // 正規answerId = "ans_{interviewId}_{userId}"
            $canonicalId = 'ans_' . $dup['interviewId'] . '_' . $dup['userId'];
            $newest = $records[0];

            // 古いレコードを全削除してから正規レコードをupsert
            $pdo->prepare("DELETE FROM answers_new WHERE interviewId = ? AND userId = ?")
                ->execute([$dup['interviewId'], $dup['userId']]);
            $pdo->prepare("INSERT INTO answers_new (answerId, interviewId, userId, name, dept, role, responses, answeredAt)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
                ->execute([
                    $canonicalId,
                    $dup['interviewId'],
                    $dup['userId'],
                    $newest['name'],
                    $newest['dept'],
                    $newest['role'],
                    json_encode($mergedArr, JSON_UNESCAPED_UNICODE),
                    $newest['answeredAt']
                ]);
        }

        // answerId が旧形式（ans_TIMESTAMP）のレコードを正規形式にリネーム
        $oldIds = $pdo->query("
            SELECT answerId, interviewId, userId FROM answers_new
            WHERE answerId NOT LIKE CONCAT('ans_', interviewId, '_', userId)
              AND answerId LIKE 'ans_%'
        ")->fetchAll();
        foreach ($oldIds as $row) {
            $canonicalId = 'ans_' . $row['interviewId'] . '_' . $row['userId'];
            try {
                $pdo->prepare("UPDATE answers_new SET answerId = ? WHERE answerId = ?")
                    ->execute([$canonicalId, $row['answerId']]);
            } catch (Exception $e) {
                // 既に正規IDが存在する場合は古いレコードを削除
                $pdo->prepare("DELETE FROM answers_new WHERE answerId = ?")
                    ->execute([$row['answerId']]);
            }
        }
    } catch (Exception $e) {
        error_log("Answer dedup error: " . $e->getMessage());
    }
}

function formatUser($row) {
    if (!$row) return null;
    $row['isAdmin'] = (bool)(int)($row['isAdmin'] ?? 0);
    return $row;
}

function dynamicUpsert($pdo, $table, $rows) {
    if (empty($rows) || !is_array($rows)) return;
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM $table");
        $allCols = $stmt->fetchAll(PDO::FETCH_COLUMN);
    } catch (Exception $e) { return; }
    foreach ($rows as $row) {
        $insertData = [];
        foreach ($allCols as $col) {
            if (array_key_exists($col, $row)) {
                $val = $row[$col];
                if (is_bool($val)) $val = $val ? 1 : 0;
                elseif (is_array($val) || is_object($val)) $val = json_encode($val, JSON_UNESCAPED_UNICODE);
                $insertData[$col] = $val;
            }
        }
        if (empty($insertData)) continue;
        $fields = array_keys($insertData);
        $placeholders = array_map(function($f) { return ":$f"; }, $fields);
        $updates = array_map(function($f) { return "$f = VALUES($f)"; }, $fields);
        $sql = "INSERT INTO $table (" . implode(', ', $fields) . ") VALUES (" . implode(', ', $placeholders) . ") ON DUPLICATE KEY UPDATE " . implode(', ', $updates);
        $pdo->prepare($sql)->execute($insertData);
    }
    return true;
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET' && ($action === 'login_check' || $action === 'get_user')) {
    $id = $_GET['id'] ?? '';
    $stmt = $pdo->prepare("SELECT * FROM users_new WHERE id = :id");
    $stmt->execute([':id' => $id]);
    $user = $stmt->fetch();
    
    $stmtAcc = $pdo->prepare("SELECT * FROM allowed_users_new WHERE id = :id");
    $stmtAcc->execute([':id' => $id]);
    $allowed = $stmtAcc->fetch();
    
    echo json_encode([
        'success' => $user ? true : false, 
        'user' => $user ? formatUser($user) : null,
        'allowed' => $allowed ? $allowed : null
    ]);
    exit;
}

if ($method === 'POST' && $action === 'login') {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = trim($data['id'] ?? '');
    $pass = $data['password'] ?? '';
    $stmt = $pdo->prepare("SELECT * FROM users_new WHERE id = :id");
    $stmt->execute([':id' => $id]);
    $user = $stmt->fetch();
    if ($user && $user['password'] === $pass) {
        echo json_encode(['success' => true, 'user' => formatUser($user)]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Invalid ID or password']);
    }
    exit;
}

if ($method === 'POST' && $action === 'register') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Check if user already exists
    $id = trim($data['id'] ?? '');
    $stmt = $pdo->prepare("SELECT * FROM users_new WHERE id = :id");
    $stmt->execute([':id' => $id]);
    $existingUser = $stmt->fetch();
    
    if ($existingUser && !empty($existingUser['password'])) {
        echo json_encode(['success' => false, 'message' => 'このIDは既に登録されています。ログイン画面からログインしてください。']);
        exit;
    }
    
    // Validate against allowed_users_new
    if ($id !== '692') {
        $stmtAllowed = $pdo->prepare("SELECT * FROM allowed_users_new WHERE id = :id");
        $stmtAllowed->execute([':id' => $id]);
        if (!$stmtAllowed->fetch()) {
            echo json_encode(['success' => false, 'message' => 'このID(' . htmlspecialchars($id) . ')は事前登録されていません。管理者にお問い合わせください。']);
            exit;
        }
    }
    
    $debug = dynamicUpsert($pdo, 'users_new', [$data]);
    
    echo json_encode(['success' => true, 'user' => $data]);
    exit;
}

if ($method === 'POST' && $action === 'update_secret') {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = trim($data['id'] ?? '');
    $secret = $data['secret'] ?? '';
    
    if ($id && $secret) {
        $stmt = $pdo->prepare("UPDATE users_new SET secret = :secret WHERE id = :id");
        $stmt->execute([':id' => $id, ':secret' => $secret]);
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Invalid parameters']);
    }
    exit;
}

if ($method === 'GET' && empty($action)) {
    $res = ['success' => true, 'users' => [], 'interviews' => [], 'questions' => [], 'answers' => [], 'analyses' => [], 'allowedUsers' => []];
    try {
        $res['users'] = array_map('formatUser', $pdo->query("SELECT * FROM users_new")->fetchAll());
        
        $interviews = $pdo->query("SELECT * FROM interviews_new")->fetchAll();
        $questions = $pdo->query("SELECT * FROM questions_new")->fetchAll();
        
        $qMap = [];
        foreach ($questions as $q) {
            $qMap[$q['interviewId']][] = $q;
        }
        
        foreach ($interviews as &$iv) {
            $iv['questions'] = $qMap[$iv['interviewId']] ?? [];
            if (isset($iv['questionCount'])) $iv['questionCount'] = (int)$iv['questionCount'];
        }
        $res['interviews'] = $interviews;

        $res['answers'] = array_map(function($a) {
            $a['responses'] = json_decode($a['responses'] ?? '[]', true);
            return $a;
        }, $pdo->query("SELECT * FROM answers_new")->fetchAll());
        $res['allowedUsers'] = $pdo->query("SELECT * FROM allowed_users_new")->fetchAll();

        // analyses_new テーブルから取得し、swot/notes をデコードして返す
        $res['analyses'] = array_map(function($a) {
            $a['swot']  = json_decode($a['swot']  ?? '{}', true);
            $a['notes'] = json_decode($a['notes'] ?? '[]', true);
            if (isset($a['respondentCount'])) $a['respondentCount'] = (int)$a['respondentCount'];
            return $a;
        }, $pdo->query("SELECT * FROM analyses_new")->fetchAll());

        // 旧JSONブロブからのマイグレーション（analyses_new が空の場合のみ）
        if (empty($res['analyses'])) {
            $row = $pdo->query("SELECT db_data FROM swot_system_state WHERE id = 1")->fetch();
            if ($row && $row['db_data']) {
                $sd = json_decode($row['db_data'], true);
                $res['analyses'] = $sd['analyses'] ?? [];
                if (empty($res['allowedUsers'])) $res['allowedUsers'] = $sd['allowedUsers'] ?? [];
            }
        }
    } catch (Exception $e) {}
    echo json_encode($res, JSON_UNESCAPED_UNICODE);
    exit;
} elseif ($method === 'POST' && empty($action)) {
    $data = json_decode(file_get_contents('php://input'), true);
    try {
        if (isset($data['users'])) dynamicUpsert($pdo, 'users_new', $data['users']);
        if (isset($data['answers'])) dynamicUpsert($pdo, 'answers_new', $data['answers']);
        if (isset($data['allowedUsers'])) dynamicUpsert($pdo, 'allowed_users_new', $data['allowedUsers']);
        if (isset($data['interviews'])) {
            dynamicUpsert($pdo, 'interviews_new', $data['interviews']);
            $allQs = [];
            foreach ($data['interviews'] as $iv) {
                foreach ($iv['questions'] ?? [] as $q) {
                    $q['interviewId'] = $iv['interviewId'];
                    $allQs[] = $q;
                }
            }
            if (!empty($allQs)) {
                dynamicUpsert($pdo, 'questions_new', $allQs);
            }
        }
        // 分析結果を analyses_new テーブルへ保存（旧JSONブロブではなく）
        if (isset($data['analyses'])) {
            dynamicUpsert($pdo, 'analyses_new', $data['analyses']);
        }
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}
?>
