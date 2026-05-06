<?php
// This command starts Node.js in the background and detaches it from the browser
$command = "nohup node server.js > server_output.log 2>&1 & echo $!";
$pid = shell_exec($command);

echo "<h1>WebRTC Signaling Server Triggered</h1>";
echo "<p>Background Process ID: " . $pid . "</p>";
echo "<p>Check the <b>server_output.log</b> file in your File Manager for errors.</p>";
?>