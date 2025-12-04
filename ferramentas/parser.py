import json
import re
import os
from bs4 import BeautifulSoup

# RUTAS RELATIVAS (Asegúrate de que coinciden con tu estructura)
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
        
        # -------------------------------------------------------------
        # 1. EXTRAER TAGS (AQUÍ ES DONDE RECUPERAMOS EL ROUTER)
        # -------------------------------------------------------------
        media = {}
        ai_config = {}
        
        # Buscamos tags como {{ROUTER: ...}} o {{IMG: ...}}
        # Nota: NO borramos todavía del texto los comandos SHOW/HIDE/SCENE_START porque esos van incrustados.
        # Pero SÍ borramos IMG, AUDIO, ROUTER, AI...
        
        # Patrón para todos los tags conocidos
        tag_pattern = r"\{\{(IMG|AUDIO|VIDEO|VIDEO_BG|IA_CONTEXT|IA_PROMPT|IA_REACTION|SCENE_START|SHOW|HIDE|ROUTER):\s*(.*?)\}\}"
        found_tags = re.findall(tag_pattern, raw_text, re.DOTALL)
        
        for tag_type, content in found_tags:
            # A. Comandos de personaje -> Se quedan en el texto, no van a 'media'
            if tag_type in ["SCENE_START", "SHOW", "HIDE"]:
                pass 
            
            # B. Router -> Va a la configuración de IA/Lógica
            elif tag_type == "ROUTER":
                parts = [x.strip() for x in content.split(",")]
                if len(parts) >= 4:
                    ai_config["ROUTER"] = {
                        "variable": parts[0],
                        "value": parts[1],
                        "targetTrue": parts[2],
                        "targetFalse": parts[3]
                    }
            
            # C. IA -> Configuración de IA
            elif "IA" in tag_type:
                ai_config[tag_type] = content.strip()
            
            # D. Media normal (IMG, AUDIO) -> Objeto media
            else:
                media[tag_type] = content.strip()
        
        # BORRAMOS del texto visible SOLO los tags que ya hemos procesado y que no deben salir en pantalla
        # (Es decir, borramos IMG, AUDIO, ROUTER, AI... pero dejamos SHOW/HIDE/SCENE_START)
        tags_to_delete = r"\{\{(IMG|AUDIO|VIDEO|VIDEO_BG|IA_CONTEXT|IA_PROMPT|IA_REACTION|ROUTER):\s*(.*?)\}\}"
        clean_text = re.sub(tags_to_delete, "", raw_text, flags=re.DOTALL)


        # -------------------------------------------------------------
        # 2. CONVERTIR CONDICIONALES <<if>> EN COMANDOS (OPCIONAL)
        # -------------------------------------------------------------
        # Si decides usar la estrategia del ROUTER, este bloque es menos crítico, 
        # pero lo dejamos por si tienes algún if simple en medio de un diálogo.
        
        conditional_pattern = r'<<if\s+\$estado\.trama\.(\w+)\s+is\s+"([^"]+)"\s*>>(.*?)(?:<<else>>(.*?))?<</if>>'
        
        def replace_conditional(match):
            variable = match.group(1).strip()
            expected_value = match.group(2).strip()
            if_content = match.group(3).strip()
            else_content = match.group(4).strip() if match.group(4) else ""
            
            result = f"{{{{IF:{variable}={expected_value}}}}}[DIALOGUE_BREAK]{if_content}"
            if else_content:
                result += f"[DIALOGUE_BREAK]{{{{ELSE}}}}[DIALOGUE_BREAK]{else_content}"
            result += f"[DIALOGUE_BREAK]{{{{ENDIF}}}}"
            return result

        clean_text = re.sub(conditional_pattern, replace_conditional, clean_text, flags=re.DOTALL)


        # -------------------------------------------------------------
        # 3. EXTRAER OPCIONES ([[Link]])
        # -------------------------------------------------------------
        choices = []
        # Buscamos todos los links
        raw_links_content = re.findall(r"\[\[(.*?)\]\]", clean_text, re.DOTALL)
        
        for link_content in raw_links_content:
            parts = link_content.split('][', 1) 
            link_part = parts[0]
            code = parts[1] if len(parts) > 1 else None
            
            # Separar Label y Target
            l_parts = re.split(r'->|\|', link_part, 1)
            label = l_parts[0].strip()
            target = l_parts[1].strip() if len(l_parts) > 1 else l_parts[0].strip()
            
            choice = { "label": label, "target": target, "state_change": None }
            
            # Procesar el código (Setter)
            if code:
                # Busca: $estado.trama.variable = "valor"
                var_match = re.search(r"\$estado\.trama\.(\w+)\s*=\s*[\"']?(.+?)[\"']?$", code.replace('is', '='))
                if var_match:
                    val = var_match.group(2)
                    if val.lower() == "true": val = True
                    elif val.lower() == "false": val = False
                    
                    choice["state_change"] = { "variable": var_match.group(1), "value": val }
            
            choices.append(choice)
        
        # -------------------------------------------------------------
        # 4. LIMPIEZA FINAL
        # -------------------------------------------------------------
        
        # a) Borrar los links del texto
        clean_text = re.sub(r"\[\[(.*?)\]\]", "", clean_text, flags=re.DOTALL)
        
        # b) Borrar macros residuales de Twine (<<set>>, <<run>>, etc)
        clean_text = re.sub(r'<<.*?>>', '', clean_text, flags=re.DOTALL)
        
        # c) Normalizar saltos de línea para el motor de diálogo
        clean_text = clean_text.replace('\r\n', '\n')
        clean_text = re.sub(r'\n{2,}', '[DIALOGUE_BREAK]', clean_text).strip()
        
        # -------------------------------------------------------------
        # 5. GENERAR JSON
        # -------------------------------------------------------------
        story_data[pid] = {
            "id": pid,
            "text": clean_text,
            "media": media,
            "ai": ai_config, # Aquí va el ROUTER
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
        # Debug simple para ver si pilla el router en alguna escena
        for sid, sdata in data.items():
            if "ROUTER" in sdata.get("ai", {}):
                print(f"🔀 Router encontrado en: {sid}")
                break
    else:
        print("⚠️ No se generaron datos.")
except Exception as e:
    print(f"❌ ERROR CRÍTICO: {e}")