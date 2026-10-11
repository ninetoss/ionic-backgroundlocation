<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$lat = isset($_GET['lat']) ? round(floatval($_GET['lat']), 4) : 9.5;
$lon = isset($_GET['lng']) ? round(floatval($_GET['lng']), 4) : 100.0;

// === API KEYS ===
$SG_API_KEY = '4745dc8c-29f2-11f1-be04-0242ac120004-4745dd68-29f2-11f1-be04-0242ac120004';
$WA_API_KEY = 'db9055db685b4cfea2f54455260704'; // Add your new WeatherAPI key here

// Helper function
function fetchApi($url, $headerKey = null) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5); // 5 second timeout so it doesn't hang
    if ($headerKey) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: " . $headerKey]);
    }
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    // Return null if the request failed or returned an error code (like 429 Quota Exceeded)
    if ($httpCode >= 400 || !$response) return null;
    return json_decode($response, true);
}

$startTS = time();
$endTS = $startTS + (24 * 60 * 60);

// 1. Try Primary Sources
$omUrl = "https://api.open-meteo.com/v1/forecast?latitude={$lat}&longitude={$lon}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,visibility&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m&daily=sunrise,sunset&timezone=auto";
$sgCurrentUrl = "https://api.stormglass.io/v2/weather/point?lat={$lat}&lng={$lon}&params=currentSpeed,currentDirection&start={$startTS}&end={$endTS}";
$sgTideUrl = "https://api.stormglass.io/v2/tide/sea-level/point?lat={$lat}&lng={$lon}&start={$startTS}&end={$endTS}";

$omData = fetchApi($omUrl);
$sgCurrentData = fetchApi($sgCurrentUrl, $SG_API_KEY);

// If Open-Meteo succeeds AND Stormglass succeeds, use Primary
if ($omData !== null && $sgCurrentData !== null) {
    $sgTideData = fetchApi($sgTideUrl, $SG_API_KEY); // Fetch tides only if currents succeeded
    
    $output = [
        "source" => "primary",
        "data" => [
            "weather" => $omData,
            "currents" => $sgCurrentData,
            "tides" => $sgTideData
        ]
    ];
    echo json_encode($output);
    exit;
}

// ==========================================
// 2. FALLBACK TO WEATHERAPI.COM
// Runs ONLY if Stormglass or Open-Meteo fails
// ==========================================
$waUrl = "http://api.weatherapi.com/v1/marine.json?key={$WA_API_KEY}&q={$lat},{$lon}&days=1";
$waData = fetchApi($waUrl);

if ($waData !== null) {
    $output = [
        "source" => "fallback_weatherapi",
        "data" => $waData
    ];
    echo json_encode($output);
    exit;
}

// 3. If EVERYTHING fails
echo json_encode(["error" => "All weather APIs are currently unavailable."]);
// หลังจาก curl_exec($ch);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200 && $response) {
        // สำเร็จ: บันทึกทับไฟล์แคช
        file_put_contents($cacheFile, $response);
        echo $response;
    } else {
        // ล้มเหลว: ถ้ามีไฟล์แคชเก่าอยู่ ให้ดึงมาใช้ขัดตาทัพไปก่อน
        if (file_exists($cacheFile)) {
            echo file_get_contents($cacheFile);
        } else {
            echo json_encode(["error" => "API failed and no local cache available."]);
        }
    }
?>