"""
Symulacja skakania po obiektach z wyliczoną siłą na podstawie fuzzyfikacji danych 3 wejść.
Skrypt losuje planszę z platformami, a następnie animuje skoki bloku w oknie tkinter.

Dane wejściowe:
    dx: odległość w poziomie od skaczącego bloku do początku następnej platformy,
    dy: różnica wysokości między następną platformą a blokiem
    wd: szerokość następnej platformy.

Wymagane komendy
    "pip install simpful"
    "pip install tk"
    "python main.py"

Autorzy:
    Farat Władysław
    Piórek Grzegorz
"""

import simpful as sf
import tkinter as tk

import random
import time

# System rozmyty, który na podstawie położenia kolejnej platformy wylicza siłę skoku
FS = sf.FuzzySystem(show_banner=False)

#DX
# Odległość w poziomie od skaczącego bloku do początku następnej platformy
near = sf.FuzzySet(points=[[0, 1], [4, 0]], term="near")
mid = sf.FuzzySet(points=[[0, 0], [4, 1], [8, 0]], term="mid")
far = sf.FuzzySet(points=[[4, 0], [8, 1], [10, 1]], term="far")
FS.add_linguistic_variable("dx", sf.LinguisticVariable([near, mid, far]))

#DY
# Różnica wysokości między następną platformą a blokiem (ujemna: platforma jest niżej)
down = sf.FuzzySet(points=[[-3, 1], [0, 0]], term="down")
flat = sf.FuzzySet(points=[[-3, 0], [0, 1], [3, 0]], term="flat")
up = sf.FuzzySet(points=[[0, 0], [3, 1]], term="up")
FS.add_linguistic_variable("dy", sf.LinguisticVariable([down, flat, up]))

#WD
# Szerokość następnej platformy (liczba kratek)
small = sf.FuzzySet(points=[[1, 1], [2, 0]], term="small")
med = sf.FuzzySet(points=[[1, 0], [2, 1], [3, 0]], term="med")
big = sf.FuzzySet(points=[[2, 0], [3, 1]], term="big")
FS.add_linguistic_variable("wd", sf.LinguisticVariable([small, med, big]))

# Stany każdej zmiennej i przypisane im wartości liczbowe, używane do wygenerowania reguł
dx_values = {"near": 0, "mid": 4, "far": 8}
dy_values = {"down": -3, "flat": 0, "up": 3}
wd_values = {"small": 0, "med": 0.5, "big": 1}

# Tworzy po jednej regule dla każdej kombinacji stanów (3 * 3 * 3 = 27 reguł)
for a in dx_values:
    for b in dy_values:
        for c in wd_values:
            # Każda reguła ma własną, stałą wartość wyjściową
            name = f"F_{a}_{b}_{c}"
            reach = dx_values[a] + dy_values[b] + wd_values[c]
            # Skalowanie zasięgu do siły skoku z przedziału 0-1
            f = max(0, min(1, reach / 10))
            FS.set_crisp_output_value(name, f)
            rule = f"IF(dx IS {a}) AND (dy IS {b}) AND (wd IS {c}) THEN (F IS {name})"
            FS.add_rules([rule])

def jump_force(dx, dy, wd):
    """Oblicza siłę skoku na następną platformę

    Funkcja ustawia wartości zmiennych wejściowych w FS.

    Args:
        dx: Odległość w poziomie do początku platformy, w kratkach.
        dy: Różnica wysokości względem bloku, w kratkach. Wartość ujemna
            oznacza, że platforma jest niżej.
        wd: Szerokość platformy, w kratkach.

    Returns:
        Siła skoku z przedziału 0-1. Po pomnożeniu przez 10 daje zasięg w kratkach (10 to maxymalny skok)
    """
    FS.set_variable("dx", dx)
    FS.set_variable("dy", dy)
    FS.set_variable("wd", wd)
    return FS.Sugeno_inference(["F"])["F"]

# Losowanie planszy: pierwsza platforma jest stała, a kolejne powstają względem poprzedniej
platforms = [{"x": 1, "y": 2, "size": 3}]
for _ in range(4):
    prev = platforms[-1]
    platforms.append({
        # Przerwa między platformami
        "x": prev["x"] + prev["size"] + random.randint(1, 3),
        # Zmiana wysokości o maksymalnie 2 kratki, z ograniczeniem do zakresu 1-5
        "y": max(1, min(5, prev["y"] + random.randint(-2, 2))),
        "size": random.randint(1, 3),
    })

# Rozmiar jednej kratki w pikselach i wysokość okna
CELL = 40
ROWS = 10
H = ROWS * CELL

# Okno i canva do rysowania
root = tk.Tk()
canvas = tk.Canvas(root, width=30 * CELL, height=H)
canvas.pack()

# Rysuje każdą platformę jako rząd szarych kratek
for p in platforms:
    for k in range(p["size"]):
        x = (p["x"] + k) * CELL
        # Oś y na płótnie rośnie w dół, więc wysokość liczona jest od dołu okna
        y = H - p["y"] * CELL
        canvas.create_rectangle(x, y, x + CELL, y + CELL, fill="gray")

# Blok (czerwony kwadrat) startuje na pierwszej platformie
block_x = platforms[0]["x"]
block_y = platforms[0]["y"]
block = canvas.create_rectangle(0, 0, CELL, CELL, fill="red")


def put_block(x, y):
    """Przesuwa  blok na canvie na podaną pozycję.
    Blok jest rysowany o jedną kratkę wyżej niż y.

    Args:
        x: Pozycja lewej krawędzi bloku, w kratkach.
            co wykorzystuje animacja skoku.
        y: Wysokość liczona od dołu okna, w kratkach.
    """
    left = x * CELL
    top = H - (y + 1) * CELL
    canvas.coords(block, left, top, left + CELL, top + CELL)


# Pokazuje pozycję startową i czeka sekundę przed pierwszym skokiem
put_block(block_x, block_y)
canvas.update()
time.sleep(1)

# Skok na każdą kolejną platformę
for i in range(len(platforms) - 1):
    nxt = platforms[i + 1]

    # Dane wejściowe dla systemu rozmytego
    dx = nxt["x"] - block_x
    dy = nxt["y"] - block_y
    # Przeliczenie siły 0-1 z powrotem na zasięg w  kratkach
    reach = round(jump_force(dx, dy, nxt["size"]) * 10)
    # Zasięg zawiera składnik dy, więc odjęcie dy daje samo przesunięcie w poziomie
    new_x = block_x + reach - dy
    new_y = nxt["y"]

    # Animacja skoku(t rośnie od 0 do 1)
    for step in range(21):
        t = step / 20
        x = block_x + (new_x - block_x) * t
        # Ruch liniowy plus łuk, który w połowie skoku unosi blok o 2 kratki
        y = block_y + (new_y - block_y) * t + 8 * t * (1 - t)
        put_block(x, y)
        canvas.update()
        time.sleep(0.03)

    # Zapisuje miejsce lądowania jako punkt startu następnego skoku
    block_x = new_x
    block_y = new_y
    time.sleep(0.5)

# Pozostawia okno otwarte po zakończeniu animacji
root.mainloop()