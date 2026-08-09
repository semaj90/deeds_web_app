#!/usr/bin/env python3
# Optional wrapper. Enable only after direct RAPIDS worker parity passes.
import json, os, subprocess, pathlib, pika
URL=os.getenv("RABBITMQ_URL","amqp://guest:guest@127.0.0.1:5672/%2F")
QUEUE="parent-atlas.graph-analysis.requests"

def handle(ch,method,props,body):
    try:
        job=json.loads(body)
        edges=job["params"]["edgesCsv"]
        alg=job["algorithm"]
        cmd=["python",str(pathlib.Path(__file__).with_name("rapids_graph_worker.py")),edges,"--algorithm",alg]
        p=subprocess.run(cmd,capture_output=True,text=True)
        print(json.dumps({"jobId":job["jobId"],"algorithm":alg,
                          "status":"ok" if p.returncode==0 else "failed",
                          "stdout":p.stdout[-100000:],"stderr":p.stderr[-20000:]}))
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception as e:
        print(json.dumps({"status":"failed","error":str(e)}))
        ch.basic_nack(delivery_tag=method.delivery_tag,requeue=False)

conn=pika.BlockingConnection(pika.URLParameters(URL))
c=conn.channel(); c.queue_declare(queue=QUEUE,durable=True); c.basic_qos(prefetch_count=1)
c.basic_consume(queue=QUEUE,on_message_callback=handle)
print("listening",QUEUE); c.start_consuming()
