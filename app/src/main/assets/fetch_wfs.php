<?php
// Set headers so the map knows it's receiving JSON
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$wfsUrl = "https://ocean.gistda.or.th/geoserver/ais/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ais%3Aview_vessel_latest_gportal&maxfeatures=1500&outputFormat=application/json";

// Initialize cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $wfsUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

// Bypass SSL verification in case your server has outdated certificates
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

// Pretend to be a standard web browser
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

// Execute the request
$response = curl_exec($ch);
$error = curl_error($ch);
curl_close($ch);

// Output the result or the exact error
if ($response === false) {
    echo json_encode(["error" => "cURL Error: " . $error]);
} else {
    echo $response;
}
?>