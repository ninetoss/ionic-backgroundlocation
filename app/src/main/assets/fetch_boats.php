<?php
ignore_user_abort(true);
set_time_limit(120); 

$output_file = __DIR__ . '/latest_tracking.csv'; 

// 1-minute caching
if (file_exists($output_file) && time() - filemtime($output_file) < 60) {
    header('Content-Type: text/csv');
    echo file_get_contents($output_file);
    exit;
}

// 1. FETCH DATA FROM GRAPHQL DIRECTLY WITH ADMIN SECRET
$graphql_url = 'https://node.next.fisheries.go.th/v1/graphql';
$graphql_payload = json_encode([
    'operationName' => 'GetVessels',
    'variables' => [
        'where' => [
            'is_enabled' => ['_eq' => true],
            'device' => [
                'is_enabled' => ['_eq' => true],
                '_or' => [
                    ['speed' => ['_gt' => 1, '_lte' => 12]],
                    ['speed' => ['_gt' => 12]]
                ]
            ]
        ]
    ],
    'query' => 'query GetVessels($where: vessel_bool_exp) {
        dataSource: vessel(where: $where) {
            name
            device {
                latitude
                longitude
                heading
                speed
            }
            category_vessels {
                category {
                    name
                }
            }
        }
    }'
]);

$ch = curl_init($graphql_url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $graphql_payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'x-hasura-admin-secret: 0YBko1X3JNyJ',
    'Content-Type: application/json',
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Origin: https://back.next.fisheries.go.th',
    'Referer: https://back.next.fisheries.go.th/'
]);
$graphql_response = curl_exec($ch);
curl_close($ch);

$data = json_decode($graphql_response, true);
if (!isset($data['data']['dataSource'])) {
    http_response_code(500);
    echo "Error: Invalid response from GraphQL API.";
    exit;
}

$vessels = $data['data']['dataSource'];

// 2. GENERATE CSV
$csv_data = "รุ้ง,แวง,ชื่อเรือ,ทิศทาง,ความเร็ว,ประเภท\n";
foreach ($vessels as $vessel) {
    if (!isset($vessel['device']['latitude']) || !isset($vessel['device']['longitude'])) {
        continue;
    }
    
    $lat = $vessel['device']['latitude'];
    $lng = $vessel['device']['longitude'];
    $name = '"' . str_replace('"', '""', $vessel['name'] ?? 'Unknown') . '"';
    $heading = $vessel['device']['heading'] ?? 0;
    $speed = $vessel['device']['speed'] ?? 0;
    
    $type = 'ไม่ระบุ';
    if (!empty($vessel['category_vessels']) && isset($vessel['category_vessels'][0]['category']['name'])) {
        $type = '"' . str_replace('"', '""', $vessel['category_vessels'][0]['category']['name']) . '"';
    } else {
        $type = '"ไม่ระบุ"';
    }
    
    $csv_data .= "{$lat},{$lng},{$name},{$heading},{$speed},{$type}\n";
}

// 3. SAVE AND RETURN CSV
file_put_contents($output_file, $csv_data);
header('Content-Type: text/csv');
echo $csv_data;
?>