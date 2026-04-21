import datetime

class PaidInsertion:
    def __init__(self, filename, start_str, end_str):
        self.filename = filename
        self.start_time = datetime.datetime.strptime(start_str, "%H:%M").time()
        self.end_time = datetime.datetime.strptime(end_str, "%H:%M").time()

    def is_in_range(self, block_time_str):
        if block_time_str == "24:00": block_time_str = "00:00"
        block_time = datetime.datetime.strptime(block_time_str, "%H:%M").time()

        if self.start_time <= self.end_time:
            return self.start_time <= block_time < self.end_time
        else:
            return block_time >= self.start_time or block_time < self.end_time

    def to_dict(self):
        return {
            "filename": self.filename,
            "start_time": self.start_time.strftime("%H:%M"),
            "end_time": self.end_time.strftime("%H:%M")
        }
