<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

header("Content-Type: application/json");
require 'config.php';

$data = json_decode(file_get_contents("php://input"), true);

if(empty($data['username']) || empty($data['password'])) {
    echo json_encode(["status" => "error", "message" => "Incomplete data"]);
    exit();
}

try {
    $username = $data['username'];
    // In a real app, use password_hash($data['password'], PASSWORD_DEFAULT)
    $password = $data['password']; 

    $sql = "INSERT INTO tmp_patrol (username, password) VALUES (:username, :password)";
    $stmt = $conn->prepare($sql);
    
    if($stmt->execute(['username' => $username, 'password' => $password])) {
        // FIXED: Added "status" => "success"
        echo json_encode(["status" => "success", "message" => "User registered successfully"]);
    } else {
        echo json_encode(["status" => "error", "message" => "Registration failed"]);
    }

} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Error: " . $e->getMessage()]);
}
?>