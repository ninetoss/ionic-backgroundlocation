<?php
// 1. อนุญาตให้หน้าเว็บอ่านข้อมูลจากไฟล์นี้ได้ (แก้ปัญหา CORS ฝั่งเราเอง)
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

// 2. รับชื่อ Layer ที่หน้าเว็บส่งมา
$layer = isset($_GET['layer']) ? $_GET['layer'] : '';

if (empty($layer)) {
    http_response_code(400);
    echo json_encode(["error" => "ไม่ได้ระบุชื่อ Layer"]);
    exit;
}

// 3. สร้าง URL ปลายทางของ GISTDA
$targetUrl = "https://ocean.gistda.or.th/geoserver/coastalradar/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=coastalradar:" . urlencode($layer) . "&outputFormat=application/json";

// 4. ใช้ cURL เพื่อไปดึงข้อมูลจาก GISTDA
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // ป้องกันปัญหา SSL Certificate
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// 5. ส่งข้อมูลกลับไปให้หน้าเว็บ
if ($httpCode == 200 && $response) {
    echo $response;
} else {
    http_response_code(500);
    echo json_encode(["error" => "ไม่สามารถดึงข้อมูลจากต้นทางได้"]);
}
?>