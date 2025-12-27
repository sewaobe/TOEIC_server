import { IUserNote, UserNote } from "../models/user_note.model";

export const getNotesByUserIdService = async (user_id: string) => {
  const notes = await UserNote.find({ user_id }).sort({ created_at: -1 });
  return notes;
};

export const createNoteService = async (
  note_data: Partial<IUserNote>,
  user_id: string
) => {
  const newNote = new UserNote({
    ...note_data,
    user_id,
  });

  const savedNote = await newNote.save();
  return savedNote;
};

export const updateNoteService = async (
  user_id: string,
  note_id: string,
  note_data: Partial<IUserNote>
) => {
  const updatedNote = await UserNote.findOneAndUpdate(
    {
      _id: note_id,
      user_id,
    },
    note_data,
    { new: true }
  );

  return updatedNote;
};

export const deleteNoteService = async (user_id: string, note_id: string) => {
  const deletedNote = await UserNote.findOneAndDelete({
    _id: note_id,
    user_id,
  });

  return deletedNote;
};

export const getNoteByRelatedIdService = async (
  user_id: string,
  related_id: string
) => {
  const note = await UserNote.findOne({
    user_id,
    "related_object.related_id": related_id,
  });

  return note;
};
