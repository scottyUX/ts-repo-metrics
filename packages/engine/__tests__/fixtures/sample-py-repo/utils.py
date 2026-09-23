def add(a, b):
    return a + b


def nested(x):
    total = 0
    if x > 0:
        for i in range(x):
            while total < 10:
                try:
                    total += 1
                except:
                    pass
    print("done")
    return total
