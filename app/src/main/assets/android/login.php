<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200); 
    exit();
}
header('Content-Type: application/json');
require 'config.php';

$data = json_decode(file_get_contents("php://input"), true);
if (empty($data['username']) || empty($data['password'])) { 
    echo json_encode(["status" => "error", "message" => "Incomplete data"]); 
    exit();
}

$username = $data['username'];
$password = $data['password'];

try { 
    $sql = "SELECT * FROM tmp_patrol WHERE username = ? AND password = ?"; 
    $stmt = $conn->prepare($sql); 
    $stmt->execute([$username, $password]); 

    if ($stmt->rowCount() > 0) { 
        // --- START: Background Boat Data Trigger ---
        $trigger_url = "https://dntservicetruck.co.th/fetch_boats.php";
        $ch = curl_init($trigger_url);

        // Safely timeout after 1 second to prevent hanging the login screen
        curl_setopt($ch, CURLOPT_TIMEOUT, 1); 
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

        curl_exec($ch);
        curl_close($ch);
        // --- END: Background Boat Data Trigger ---

        $row = $stmt->fetch(PDO::FETCH_ASSOC); 
        echo json_encode([
            "status" => "success", 
            "id" => $row['id'],
            "role" => $row['role'],
            "username" => $row['username'],
            "number" => $row['number'],
            "message" => "Login successful"
        ]); 
    } else { 
        echo json_encode(["status" => "error", "message" => "Invalid username or password"]); 
    }
} catch (PDOException $e) { 
    echo json_encode(["status" => "error", "message" => "Database error: " . $e->getMessage()]);
}
?>