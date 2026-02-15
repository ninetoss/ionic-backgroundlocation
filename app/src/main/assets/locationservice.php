<?php
date_default_timezone_set("Asia/Bangkok");
$UserId = $_POST['UserId'] ?? null;
$lat = $_POST['lat'] ?? null;
$lng = $_POST['lng'] ?? null;
$bearing = $_POST['bearing'] ?? null;
$speed = $_POST['speed'] ?? null;
$incoming_ts = $_POST['timestamp'] ?? time();
if (is_numeric($incoming_ts)) {
    if ($incoming_ts > 100000000000) {
        $timestamp_seconds = $incoming_ts / 1000;
    } else {
        $timestamp_seconds = $incoming_ts;
    }
    $time = date("H:i:s", $timestamp_seconds);
} else {
    $time = $incoming_ts;
}
if (!$lat || !$lng) {
    http_response_code(400);
    exit("Invalid data");
} // <--- Added closing brace here
$data = [
    "UserId" => $UserId, // <--- Changed '=' to '=>'
    "lat" => $lat,
    "lng" => $lng,
    "bearing" => $bearing,
    "speed" => $speed,
    "timestamp" => $time
];
file_put_contents("location.json", json_encode($data));
file_put_contents("log.txt", "{ $UserId, $lat, $lng, $bearing, $speed, $time },\n", FILE_APPEND);
$host = "localhost";
$dbname = "dntser_db";
$username = "dntser_db";
$password = "dnt123456";
try {
    $conn = new PDO("mysql:host=$host;dbname=$dbname", $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    echo "Connection failed: " . $e->getMessage();
}
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $UserId = $_POST['UserId']; // We will add this in Kotlin
    $lat = $_POST['lat'];
    $lng = $_POST['lng'];
    $bearing = $_POST['bearing'];
    $speed = $_POST['speed'];
    $timestamp = $_POST['timestamp'];

    // Insert or Update the location for this specific user
    $stmt = $conn->prepare("INSERT INTO user_locations (user_id, latitude, longitude, bearing, speed, timestamp) 
                            VALUES (?, ?, ?, ?, ?, ?) 
                            ON DUPLICATE KEY UPDATE latitude=?, longitude=?, bearing=?, speed=?, timestamp=?");
    $stmt->bind_param("iddddiiddddi", $UserId, $lat, $lng, $bearing, $speed, $timestamp, $lat, $lng, $bearing, $speed, $timestamp);
    $stmt->execute();
    echo "Location saved";

} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // --- ADMIN MODE: Get All Locations ---
    // Join with user table to get names if needed
    $sql = "SELECT ul.*, u.username FROM user_locations ul JOIN user u ON ul.user_id = u.id";
    $result = $conn->query($sql);
    
    $locations = [];
    while($row = $result->fetch_assoc()) {
        $locations[] = $row;
    }
    echo json_encode($locations);
}
?>