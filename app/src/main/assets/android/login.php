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

if(empty($data['username']) || empty($data['password'])) {
    echo json_encode(["status" => "error", "message" => "Incomplete data"]);
    exit();
}

$username = $data['username'];
$password = $data['password'];

try {
    // Ideally, use password_verify() here if you are hashing passwords
    $sql = "SELECT * FROM user WHERE username = ? AND password = ?";
    $stmt = $conn->prepare($sql);
    $stmt->execute([$username, $password]);

    if ($stmt->rowCount() > 0) {
        // FIXED: Added "status" => "success" so login.html can recognize it
        echo json_encode(["status" => "success", "name" => "$username", "password" => "$password", "message" => "Login successful"]);
    } else {
        echo json_encode(["status" => "error", "message" => "Invalid username or password"]);
    }
} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Database error: " . $e->getMessage()]);
}
?>
