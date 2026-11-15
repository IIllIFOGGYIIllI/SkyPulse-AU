#!/usr/bin/env python3
"""Offline NSW RFS CAP and GeoJSON geometry regression."""
import pathlib,sys,xml.etree.ElementTree as ET
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
import sync_feeds, sync_warnings
coords=[[151.3,-32.8],[151.4,-32.8],[151.4,-32.7],[151.3,-32.7]]
geometry={"type":"GeometryCollection","geometries":[{"type":"Point","coordinates":[151.33,-32.8]},{"type":"Polygon","coordinates":[coords]}]}
out=sync_feeds.safe_geometry(geometry)
assert out["type"]=="GeometryCollection"
assert out["geometries"][0]["type"]=="Point"
assert out["geometries"][1]["coordinates"][0][-1]==coords[0]
assert sync_feeds.safe_geometry({"type":"Polygon","coordinates":[[[-70,0],[20,10],[40,10]]]}) is None
assert sync_feeds.safe_geometry({"type":"Polygon","coordinates":[coords*1300]}) is None,"Do not clip published fire boundaries"
info=ET.fromstring("<info><event>Watch and Act - Bushfire</event><headline>Watch and Act near Cessnock</headline><area><areaDesc>Cessnock district</areaDesc><polygon>-32.84,151.31 -32.84,151.38 -32.80,151.38 -32.80,151.31</polygon></area></info>")
assert sync_warnings.alert_level_from_info(info)=="Watch and Act"
assert sync_warnings.area_names_from_info(info)==["Cessnock district"]
assert len(sync_warnings.polygons_from_info(info))==1
info.find("area/polygon").text=" ".join(["-32.83,151.33"]*3001)
assert sync_warnings.polygons_from_info(info)==[],"Do not truncate warning boundaries"
assert sync_warnings.alert_level_from_info(ET.fromstring("<info><event>Bush Fire</event></info>"))=="Unspecified"
print("NSW Fire Geometry PASSED: source-supplied shapes, no truncated polygons, proper CAP warnings.")

# Official GeoJSON descriptions contain HTML-separated detail rows. Test strict
# extraction and NSW local-time conversion without rendering arbitrary HTML.
incident_html = (
    "ALERT LEVEL: Advice <br />"
    "LOCATION: MCFARLANE ST, CESSNOCK 2325 <br />"
    "COUNCIL AREA: Cessnock <br />"
    "STATUS: Under control <br />"
    "TYPE: Bush Fire <br />"
    "FIRE: Yes <br />"
    "SIZE: 93 ha <br />"
    "RESPONSIBLE AGENCY: Rural Fire Service <br />"
    "UPDATED: 16 Nov 2026 09:50"
)
fields = sync_feeds.parse_rfs_incident_description(incident_html)
assert fields["alert_level"] == "Advice"
assert fields["location"] == "MCFARLANE ST, CESSNOCK 2325"
assert fields["council_area"] == "Cessnock"
assert fields["status"] == "Under control"
assert fields["incident_type"] == "Bush Fire"
assert fields["fire"] == "Yes"
assert fields["size"] == "93 ha"
assert fields["responsible_agency"] == "Rural Fire Service"
assert fields["updated"] == "16 Nov 2026 09:50"
assert fields["updated_at"].endswith("+11:00")
assert sync_feeds.parse_rfs_incident_description(
    "STATUS: Under control <br />"
    "SIZE: <script>alert('oops')</script> <br />"
    "NOT_A_FIELD: hidden"
).get("not_a_field") is None
assert sync_feeds.parse_rfs_incident_description("") == {}
print("NSW RFS Incident Details PASSED: source HTML labels, published address, status, size, agency and AEDT last-update.")
