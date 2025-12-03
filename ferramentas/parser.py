import json
import re
import os
from bs4 import BeautifulSoup

# RUTAS RELATIVAS
INPUT_FILE = os.path.join(os.path.dirname(__file__), '../contido/m68-master.html')
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), '../web-app/src/data/historia.json')

os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

def parse_twine_html(file_path):
    if not os.path.exists(file_path):
        print(f"❌ ERROR: No encuentro el archivo {file_path}")
        return {}

    with open(file_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')

    passages = soup.find_all('tw-passagedata')
    story_data = {}

    print(f"🔄 Procesando {len(passages)} pasajes...")

    for p in passages:
        pid = p['name']
        if pid in ["StoryInit", "StoryTitle", "StoryData"]:
            continue

        # Usamos html.unescape para asegurar que -> no sea &gt;
        raw_text = p.get_text() # get_text() suele ser más limpio que .text directo
        
        # 1. Extraer Multimedia y Tags (Igual que antes)
        media = {}
        ai_config = {}
        tag_pattern = r"\{\{(IMG|AUDIO|VIDEO|VIDEO_BG|IA_CONTEXT|IA_PROMPT|IA_REACTION|CHARS):\s*(.*?)\}\}"
        found_tags = re.findall(tag_pattern, raw_text, re.DOTALL) # re.DOTALL permite multilínea
        
        for tag_type, content in found_tags:
            if "IA" in tag_type:
                ai_config[tag_type] = content.strip()
            elif tag_type == "CHARS":
                # Convertimos "manuela, concha" en ["manuela", "concha"]
                media["CHARS"] = [x.strip() for x in content.split(",")]
            else:
                media[tag_type] = content.strip()
                
        clean_text = re.sub(tag_pattern, "", raw_text, flags=re.DOTALL)

        # 2. Extraer Opciones (NUEVA LÓGICA MÁS ROBUSTA)
        choices = []
        
        # Esta regex busca [[ ... ]] de forma más agresiva
        # Captura todo lo que hay dentro de los corchetes dobles
        raw_links = re.findall(r"\[\[(.*?)\]\]", clean_text, re.DOTALL)
        
        for link_content in raw_links:
            # Ahora analizamos lo que había dentro manualmente
            label = link_content
            target = link_content
            code = None
            
            # 1. Separar código (setter) si existe: algo ][ $variable...
            if "][" in link_content:
                parts = link_content.split("][")
                link_text_part = parts[0] # La parte de "Label->Destino"
                code = parts[1]           # La parte de "$estado..."
                
                # Limpiar el código por si quedó algún corchete suelto
                code = code.replace("]", "")
            else:
                link_text_part = link_content

            # 2. Separar Label y Target: "Label -> Target" o "Label|Target"
            if "->" in link_text_part:
                l_parts = link_text_part.split("->")
                label = l_parts[0].strip()
                target = l_parts[1].strip()
            elif "|" in link_text_part:
                l_parts = link_text_part.split("|")
                label = l_parts[0].strip()
                target = l_parts[1].strip()
            else:
                # Si es [[Target]], label y target son lo mismo
                label = link_text_part.strip()
                target = link_text_part.strip()

            choice = {
                "label": label,
                "target": target,
                "state_change": None
            }
            
            # 3. Procesar la variable
            if code:
                # Busca: $estado.trama.variable [is|=] "valor"
                # Aceptamos tanto "=" como "is" por si acaso
                var_match = re.search(r"\$estado\.trama\.(\w+)\s*(?:=|is)\s*[\"']?(.+?)[\"']?$", code)
                if var_match:
                    val = var_match.group(2)
                    if val.lower() == "true": val = True
                    elif val.lower() == "false": val = False
                    
                    choice["state_change"] = {
                        "variable": var_match.group(1),
                        "value": val
                    }
            
            choices.append(choice)
        
        # Eliminar los links del texto visible
        clean_text = re.sub(r"\[\[(.*?)\]\]", "", clean_text, flags=re.DOTALL).strip()

        story_data[pid] = {
            "id": pid,
            "text": clean_text,
            "media": media,
            "ai": ai_config,
            "choices": choices
        }

    return story_data

# EJECUCIÓN
try:
    data = parse_twine_html(INPUT_FILE)
    if data:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"✅ ÉXITO: JSON regenerado en {OUTPUT_FILE}")
        # DEBUG: Imprimir la primera escena para ver si pilló los botones
        first_scene = list(data.keys())[0] if data else "Ninguna"
        print(f"👀 Chequeo rápido: La escena '{first_scene}' tiene {len(data[first_scene]['choices'])} opciones detectadas.")
    else:
        print("⚠️ No se generaron datos.")
except Exception as e:
    print(f"❌ ERROR CRÍTICO: {e}")
