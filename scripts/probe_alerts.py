#!/usr/bin/env python3
"""Inspect XML *structure* of public government/warning feeds (no feed contents logged)."""
import collections
import urllib.request
import xml.etree.ElementTree as ET

URLS = {
    "NSW_RFS_POLYGON_WARNINGS": "https://www.rfs.nsw.gov.au/feeds/IncidentAlerts.xml",
    "NSW_RFS_CAP": "https://www.rfs.nsw.gov.au/feeds/majorIncidentsCAP.xml",
    "WMO_BOM_CAP_RSS": "https://severeweather.wmo.int/v2/cap-alerts/au-bom-en/rss.xml",
}
for name,url in URLS.items():
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"SkyPulseAU/1.0 (+https://github.com/IIllIFOGGYIIllI/SkyPulse-AU)","Accept":"application/xml,text/xml,application/rss+xml,*/*"})
        with urllib.request.urlopen(req,timeout=15) as response:
            content=response.read(2_000_000)
        if not content.strip():
            print(name, "EMPTY_DOCUMENT (RFS may have no active warnings)")
            continue
        root=ET.fromstring(content)
        local=lambda t:t.split("}")[-1]
        names=[local(x.tag) for x in list(root)]
        paths=collections.Counter(local(x.tag) for x in root.iter())
        print(name,"root",local(root.tag),"length",len(content),"children",names[:20],"elements",paths.most_common(24))
        if name=="NSW_RFS_POLYGON_WARNINGS":
            print("RFS_POLYGON_RECORD_TAGS",sorted(set(names))[:30])
            # Report one record's structural keys, never warning details.
            if len(root):
                print("RFS_SAMPLE_RECORD_FIELD_NAMES",[local(e.tag) for e in list(root[0])[:35]])
    except Exception as exc:
        print(name,"UNAVAILABLE",type(exc).__name__,str(exc)[:130])
