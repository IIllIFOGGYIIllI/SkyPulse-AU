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

# Inspect the first CAP warning in the polygon feed and the newest WMO feed entries.
for name,url in (("RFS_CAP_WARNING_DETAILS",URLS["NSW_RFS_POLYGON_WARNINGS"]),("WMO_RSS_NEWEST",URLS["WMO_BOM_CAP_RSS"])):
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"SkyPulseAU/1.0","Accept":"application/xml,text/xml,*/*"})
        root=ET.fromstring(urllib.request.urlopen(req,timeout=12).read(2_000_000))
        local=lambda x:x.tag.split("}")[-1]
        if name=="RFS_CAP_WARNING_DETAILS":
            alerts=[x for x in root.iter() if local(x)=="alert"]
            print(name,"alert-count",len(alerts))
            if alerts:
                al=alerts[0]
                print("CAP_TOP_LEVEL",[local(x) for x in al])
                infos=[x for x in al if local(x)=="info"]
                if infos:
                    inf=infos[0]
                    print("CAP_INFO_FIELDS",[local(x) for x in inf])
                    areas=[x for x in inf if local(x)=="area"]
                    if areas:
                        print("CAP_AREA_FIELDS",[local(x) for x in areas[0]])
                    print("CAP_PARAMETERS",[(next((v.text for v in x if local(v)=="valueName"),"")) for x in inf if local(x)=="parameter"][:30])
        else:
            items=root.findall(".//item")
            for item in items[:5]:
                print("WMO_ENTRY",repr((item.findtext("title") or "")[:160]),repr((item.findtext("pubDate") or "")[:70]),repr((item.findtext("link") or "")[:150]))
    except Exception as exc:
        print(name,"UNAVAILABLE",str(exc)[:130])
