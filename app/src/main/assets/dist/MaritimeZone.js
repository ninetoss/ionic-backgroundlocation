var statesData = [{
      "type": "FeatureCollection", "features": [<?php $con = mysqli_connect("localhost","dntser_db","dnt123456","dntser_db");
									mysqli_query($con, "SET NAMES 'utf8' ");
									$sql = "SELECT count AS count, locate AS locate, part_name AS part_name FROM mpd_unit WHERE locate <>'' ORDER BY count ASC LIMIT 1,84";
									$result = mysqli_query($con, $sql);
									if ($result->num_rows > 0) {
										while ($row = $result->fetch_assoc()) {
											$data = explode(",", '{"type": "Polygon", "coordinates":[[' . $row['locate'] . ']], "name": "' . $row['part_name'] . '", "id": "' . $row['count'] . '"}');
											foreach ($data as &$value) {
												$ivalue = trim($value);
												echo "$ivalue,";
											}
										}
									} ?><?php $con = mysqli_connect("localhost","dntser_db","dnt123456","dntser_db");
									mysqli_query($con, "SET NAMES 'utf8' ");
									$sql = "SELECT count AS count, locate AS locate, unit_name AS unit_name FROM mpd_unit WHERE locate <>'' ORDER BY count ASC LIMIT 0,1";
									$result = mysqli_query($con, $sql);
									if ($result->num_rows > 0) {
										while ($row = $result->fetch_assoc()) {
											$data = explode(" ", '{"type": "Polygon", "coordinates":[[' . $row['locate'] . ']], "name": "' . $row['unit_name'] . '", "id": "' . $row['count'] . '"}');
											foreach ($data as &$value) {
												$ivalue = trim($value);
												echo "$ivalue";
											}
										}
									} ?>
            ]
        }]

