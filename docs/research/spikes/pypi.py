import sys, json, urllib.request
for p in sys.argv[1:]:
    try:
        j = json.load(urllib.request.urlopen(f"https://pypi.org/pypi/{p}/json"))
        i = j["info"]; v = i["version"]; f = j["releases"].get(v, [])
        d = f[0]["upload_time"][:10] if f else "?"
        lic = (i.get("license_expression") or i.get("license") or "")[:40]
        print(f"{i['name']:22} {v:12} {d} license={lic!r} py={i.get('requires_python')}")
    except Exception as e:
        print(p, "ERR", e)
