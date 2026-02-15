function getMarkers3() {
                                var data = [<?php $con = mysqli_connect("localhost","dntser_db","dnt123456","dntser_db");
                                mysqli_query($con, "SET NAMES 'utf8' ");
                                $sql = "SELECT * FROM mpd_shipgreen";
                                $result = mysqli_query($con, $sql);
                                if ($result -> num_rows > 0) {
                                    while ($row = $result -> fetch_assoc()) {
                                        $data = explode(",", '['.$row['lat']. ', '.$row['lng']. ', "'.$row['name']. '", shipgreen]');
                                        foreach($data as & $key) {
                                            $keygen = trim($key);
                                        echo "$keygen,";
                                        }
                                    }
                                } ?><?php $con = mysqli_connect("localhost","dntser_db","dnt123456","dntser_db");
                                mysqli_query($con, "SET NAMES 'utf8' ");
                                $sql = "SELECT * FROM mpd_shipblue";
                                $result = mysqli_query($con, $sql);
                                if ($result -> num_rows > 0) {
                                    while ($row = $result -> fetch_assoc()) {
                                        $data = explode(",", '['.$row['lat']. ', '.$row['lng']. ' , "'.$row['name']. '", shipblue]');
                                        foreach($data as & $val) {
                                            $value = trim($val);
                                        echo "$value,";
                                        }
                                    }
                                } ?>]
                                if (data == null || typeof data == 'undefined') {
                                    return [];
                                } else {
                                    return data;
                                }
                            };