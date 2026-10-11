<?php
date_default_timezone_set("Asia/Bangkok");
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$servername = "localhost";
$username = "dntser_db";
$password = "dnt123456";
$dbname = "dntser_db";

$UserId  = $_POST['UserId'] ?? null;
$lat     = $_POST['lat'] ?? null;
$lng     = $_POST['lng'] ?? null;
$bearing = $_POST['bearing'] ?? null;
$speed   = $_POST['speed'] ?? null;
$status  = $_POST['status'] ?? null;

if (!$UserId) { 
    http_response_code(400); 
    exit(json_encode(["error" => "Invalid data. Missing UserId."]));
}
if (!$status && (!$lat || !$lng)) {
    http_response_code(400); 
    exit(json_encode(["error" => "Invalid data. Must provide either status or lat/lng."]));
}

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) { 
    die(json_encode(["error" => "Connection failed: " . $conn->connect_error]));
}

if ($status && !$lat && !$lng) {

    if ($status === 'offline') {
        $sql = "UPDATE tmp_patrol SET status=?, speed='0' WHERE id=?";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param("ss", $status, $UserId);
    } else {
        $sql = "UPDATE tmp_patrol SET status=? WHERE id=?";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param("ss", $status, $UserId);
    }
    
    if ($stmt) {
        $stmt->execute();
        $stmt->close();
    }
} else if ($lat && $lng) {

    $sql = "UPDATE tmp_patrol SET lat=?, lng=?, bearing=?, speed=?, status='online' WHERE id=?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("sssss", $lat, $lng, $bearing, $speed, $UserId); 
    if ($stmt) {
        $stmt->execute(); 
        $stmt->close();
    }
}

$online_sql = "SELECT * FROM tmp_patrol WHERE status = 'online' AND lat IS NOT NULL AND lng IS NOT NULL AND id != '1'";
$online_result = $conn->query($online_sql);

$online_devices = array();
$features = array();

if ($online_result && $online_result->num_rows > 0) { 
    while($row = $online_result->fetch_assoc()) { 
        $shipName = !empty($row['name']) ? $row['name'] : 'Unknown';
        $shipNumber = !empty($row['number']) ? $row['number'] : '';
        
        // Build the basic array
        $online_devices[] = array( 
            "UserId" => (string)$row['id'], 
            "Number" => $shipNumber, 
            "Name" => $shipName,
            "Type" => $row['type'] ?? '',
            "UnitName" => $row['unit_name'] ?? '',
            "lat" => (string)$row['lat'],
            "lng" => (string)$row['lng'],
            "bearing" => (string)($row['bearing'] ?? '0.0'),
            "speed" => (string)($row['speed'] ?? '0.0')
        );
        
        // Build the GeoJSON feature array
        $features[] = array(
            "type" => "Feature",
            "geometry" => array(
                "type" => "Point",
                "coordinates" => array((float)$row['lng'], (float)$row['lat']) // GeoJSON uses [lng, lat]
            ),
            "properties" => array(
                "name" => $shipName,
                "number" => $shipNumber,
                "status" => "online"
            )
        );
    }
}

// 1. Write the standard location.json file
file_put_contents('location.json', json_encode($online_devices, JSON_UNESCAPED_UNICODE));

// 2. Write the location.js file with GeoJSON
$online_geoJSON = array( 
    "type" => "FeatureCollection", 
    "features" => $features
);
$js_content = "const locationJSON = " . json_encode($online_geoJSON, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . ";";
file_put_contents('location.js', $js_content);

$offline_sql = "SELECT * FROM tmp_patrol WHERE (status = 'offline' OR status IS NULL) AND lat IS NOT NULL AND lng IS NOT NULL AND id != '1'";
$offline_result = $conn->query($offline_sql);

$offline_features = array();
if ($offline_result && $offline_result->num_rows > 0) {
    while($row = $offline_result->fetch_assoc()) {
        $shipName = !empty($row['name']) ? $row['name'] : 'Unknown';
        $shipNumber = !empty($row['number']) ? $row['number'] : 'Unknown';
        
        $offline_features[] = array(
            "type" => "Feature",
            "geometry" => array(
                "type" => "Point",
                "coordinates" => array((float)$row['lng'], (float)$row['lat'])
            ),
            "properties" => array(
                "name" => $shipName,
                "number" => $shipNumber,
                "bearing" => (string)($row['bearing'] ?? '0.0'),
                "status" => "offline"
            )
        );
    }
}

$geoJSON = array( 
    "type" => "FeatureCollection", 
    "features" => $offline_features
);
file_put_contents("geolocation.json", json_encode($geoJSON, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

if ($status && !$lat && !$lng) {
    echo json_encode(["success" => "Device status set to $status. Files updated."]);
} else {
    echo json_encode(["success" => "Location logged successfully. Files updated."]);
}

$conn->close();
?>