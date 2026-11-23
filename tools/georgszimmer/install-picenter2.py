"""Deploy only the Georgszimmer adapter to the existing Junior flows with revision protection."""
import json
from pathlib import Path
from urllib.request import Request, urlopen

URL = "http://192.168.0.150:1880/flows"
HEADERS = {"Node-RED-API-Version":"v2", "Content-Type":"application/json", "Node-RED-Deployment-Type":"nodes"}
state = json.load(urlopen(Request(URL, headers=HEADERS), timeout=15))
nodes = {n["id"]: n for n in state["flows"]}
plc = nodes["8008fcec663d98f2"]["z"]
controller = Path(__file__).with_name("room-controller.js").read_text()
def put(id, kind, z, name, x, y, wires, **props):
    node = dict(id=id,type=kind,z=z,name=name,x=x,y=y,wires=wires,**props)
    if id in nodes:
        if nodes[id]["type"] != kind or nodes[id]["z"] != z:
            raise ValueError("Node-ID belegt: " + id)
        nodes[id].update(node)
    else:
        state["flows"].append(node)
        nodes[id] = node

for i, method in enumerate(("get", "post")):
    put("georg_room_"+method,"http in",plc,"Georgszimmer "+method.upper(),190,1140+i*60,
        [["georg_room_api"]],method=method,url="/georgszimmer/light",upload=False,swaggerDoc="")
put("georg_room_api","function",plc,"Raumlicht und Szenen",480,1160,
    [["8008fcec663d98f2"],["georg_room_reply"]],func=controller,outputs=2)
put("georg_room_reply","http response",plc,"PLC-Rückmeldung",780,1200,[],statusCode="",headers={})
for i, link_id in enumerate(["8b0cd28fad0a2680","b01836120b219a41","387e17d5f7d59f1c","4916fd261b3ef4a6","56a451dc7dc2612f"]):
    link = nodes[link_id]
    hardware = next(n for n in nodes.values() if n.get("z")==link["z"] and n["type"]=="phidget22-digitaloutput" and str(n["channel"])==str(i) and str(n["deviceSerialNumber"])=="800330" and str(n["hubPort"])=="2")
    adapter = "georg_room_pwm_"+str(i)
    previous = nodes[link["wires"][0][0]]
    if previous["id"] != adapter and previous["wires"] != [[hardware["id"]]]:
        raise ValueError("Lichtverdrahtung geändert")
    curve = (Path(__file__).resolve().parents[2] / "nodes/light-profile-curve.cjs").read_text().split("module.exports")[0]
    code = curve + "\n" + Path(__file__).with_name("pwm-channel.js").read_text().replace("CHANNEL_INDEX", str(i))
    put(adapter,"function",link["z"],"Lichtpegel "+str(i+1),1070,link["y"]-45,[[hardware["id"]]],func=code,outputs=1)
    link["wires"] = [[adapter]]
api = nodes["georg_room_api"]
if "georgszimmerSceneSettings" not in api.get("initialize",""):
    previous = json.load(urlopen("http://192.168.0.150:1880/georgszimmer/light", timeout=5))
    defaults = {key:previous[key] for key in ("brightness","scenario")}
    api["initialize"] = "if (!global.get('georgszimmerSceneSettings')) global.set('georgszimmerSceneSettings'," + json.dumps(defaults) + ");"
request = Request(URL, data=json.dumps(state).encode(), headers=HEADERS, method="POST")
with urlopen(request, timeout=45) as response:
    print("PICENTER2-Deployment", response.status)
