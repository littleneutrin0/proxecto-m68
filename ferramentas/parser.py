import json
import re
import os
from bs4 import BeautifulSoup

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

        raw_text = p.get_text()

        # 1. Extraer Multimedia y Tags
        media = {}
        ai_config = {}
        tags_a_eliminar = r"\{\{(IMG|AUDIO|VIDEO|VIDEO_BG|IA_CONTEXT|IA_PROMPT|IA_REACTION|CHARS):\s*(.*?)\}\}"
        
        found_tags = re.findall(tags_a_eliminar, raw_text, re.DOTALL)
        for tag_type, content in found_tags:
            if "IA" in tag_type:
                ai_config[tag_type] = content.strip()
            elif tag_type == "CHARS":
                media["CHARS"] = [x.strip() for x in content.split(",")]
            else:
                media[tag_type] = content.strip()

        clean_text = re.sub(tags_a_eliminar, "", raw_text, flags=re.DOTALL)

        # 2. NUEVO: Convertir condicionales <<if>>/<<else>> en comandos especiales
        # Patrón para detectar bloques if/else/endif
        conditional_pattern = r'<<if\s+\$estado\.trama\.(\w+)\s+is\s+"([^"]+)"\s*>>(.*?)(?:<<else>>(.*?))?<</if>>'
        
        def replace_conditional(match):
            variable = match.group(1).strip()  # ej: "invitacionMezquita"
            expected_value = match.group(2).strip()  # ej: "aceptada"
            if_content = match.group(3).strip()  # Contenido del if
            else_content = match.group(4).strip() if match.group(4) else ""  # Contenido del else
            
            # DEBUG: Imprimir lo que encontramos
            print(f"  🔍 Condicional detectada: {variable} == '{expected_value}'")
            
            # Convertimos a comandos especiales que React entenderá
            result = f"{{{{IF:{variable}={expected_value}}}}}[DIALOGUE_BREAK]{if_content}"
            if else_content:
                result += f"[DIALOGUE_BREAK]{{{{ELSE}}}}[DIALOGUE_BREAK]{else_content}"
            result += f"[DIALOGUE_BREAK]{{{{ENDIF}}}}"
            
            return result

        clean_text = re.sub(conditional_pattern, replace_conditional, clean_text, flags=re.DOTALL)

        # 3. Extraer Opciones
        choices = []
        raw_links_content = re.findall(r"\[\[(.*?)\]\]", clean_text, re.DOTALL)
        
        for link_content in raw_links_content:
            parts = link_content.split('][', 1)
            link_part = parts[0]
            code = parts[1] if len(parts) > 1 else None

            l_parts = re.split(r'->|\|', link_part, 1)
            label = l_parts[0].strip()
            target = l_parts[1].strip() if len(l_parts) > 1 else l_parts[0].strip()

            choice = {
                "label": label,
                "target": target,
                "state_change": None
            }

            if code:
                var_match = re.search(r"\$estado\.trama\.(\w+)\s*=\s*[\"']?(.+?)[\"']?$", code.replace('is', '='))
                if var_match:
                    val = var_match.group(2)
                    if val.lower() == "true":
                        val = True
                    elif val.lower() == "false":
                        val = False
                    choice["state_change"] = {
                        "variable": var_match.group(1),
                        "value": val
                    }

            choices.append(choice)

        # 4. Limpieza Final
        clean_text = re.sub(r"\[\[(.*?)\]\]", "", clean_text, flags=re.DOTALL)
        clean_text = re.sub(r'<<.*?>>', '', clean_text, flags=re.DOTALL)  # Eliminar <<set>>, <<run>>, etc.
        clean_text = clean_text.replace('\r\n', '\n')
        clean_text = re.sub(r'\n{2,}', '[DIALOGUE_BREAK]', clean_text).strip()

        # 5. Construir JSON
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
        first_scene = list(data.keys())[0] if data else "Ninguna"
        print(f"👀 Chequeo rápido: La escena '{first_scene}' tiene {len(data[first_scene]['choices'])} opciones detectadas.")
    else:
        print("⚠️ No se generaron datos.")
except Exception as e:
    print(f"❌ ERROR CRÍTICO: {e}")